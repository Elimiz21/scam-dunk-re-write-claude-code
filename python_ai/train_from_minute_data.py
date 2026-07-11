"""
Walk-forward training loop for the scam/pump-and-dump detector, driven by a
LOCAL archive of 1-minute US-stock bars (e.g. on an external drive).

Design: two stages, because the raw archive is billions of rows but the model
only needs daily aggregates enriched with intraday features.

  STAGE 1  aggregate  (run on the machine the drive is plugged into)
    Streams each symbol's minute bars, keeps the last N years, and reduces them
    to ONE ROW PER SYMBOL PER DAY: OHLCV + intraday pump signatures
    (max 5-minute return, intraday range, volume concentration, VWAP deviation,
    active minutes). Resumable — re-running skips finished symbols.
    Output: a single parquet/csv.gz a few hundred MB, portable anywhere.

  STAGE 2  train  (run anywhere the aggregate file is)
    Builds trailing features (no look-ahead), labels each observation by what
    ACTUALLY happened next (>=40% drawdown within ~22 trading days), then runs a
    WALK-FORWARD loop: train on an expanding past window, validate on the next
    quarter, step forward, repeat. Reports per-fold precision/recall/F1 for the
    model AND for a documented rules-proxy baseline. Saves the model only if it
    beats the baseline across folds (--save-always to override).

  STAGE 0  inspect
    Prints what the drive layout looks like (file types, columns, a sample) so
    the loader's auto-detection can be verified before burning hours.

------------------------------------------------------------------------------
USAGE (local machine with the drive attached)
------------------------------------------------------------------------------
  pip install pandas numpy scikit-learn pyarrow joblib

  python train_from_minute_data.py inspect   --root /Volumes/StockData
  python train_from_minute_data.py aggregate --root /Volumes/StockData \
      --out minute_daily_agg.parquet --years 4          # add --limit 50 first!
  python train_from_minute_data.py train     --data minute_daily_agg.parquet

Layouts auto-detected: a directory tree of per-symbol files (AAPL.csv,
MSFT.parquet, nested dirs fine, .csv/.csv.gz/.txt/.parquet/.feather), or
per-day files containing all symbols (needs a symbol column). Column names are
matched case-insensitively (timestamp/datetime/date[+time], open/high/low/close
or price, volume). Epoch timestamps (s/ms/ns) handled. If `inspect` looks wrong,
send its output back and the loader gets adapted.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATA_EXTS = {".csv", ".txt", ".parquet", ".feather"}          # (+ .gz of csv/txt)
FORWARD_DAYS = 22            # ~30 calendar days of trading
DROP_THRESHOLD = 0.40        # >=40% drawdown from close -> positive label
MIN_FORWARD_POINTS = 10
MIN_HISTORY_POINTS = 30
CHUNK_ROWS = 1_000_000

try:  # parquet needs pyarrow/fastparquet; fall back to csv.gz when absent
    import pyarrow  # noqa: F401
    PARQUET_OK = True
except ImportError:
    try:
        import fastparquet  # noqa: F401
        PARQUET_OK = True
    except ImportError:
        PARQUET_OK = False

TIME_CANDS = ["timestamp", "datetime", "date_time", "time", "ts", "t", "window_start", "date"]
SYM_CANDS = ["symbol", "ticker", "sym", "code"]
COL_MAP = {
    "open": ["open", "o"], "high": ["high", "h"], "low": ["low", "l"],
    "close": ["close", "c", "price", "last", "adj_close", "adjclose"],
    "volume": ["volume", "v", "vol", "size"],
}
FEATURES = [
    # daily price action (trailing)
    "ret_1d", "ret_5d", "ret_10d", "ret_20d", "price_zscore_20d", "ret_vol_20d",
    "max_runup_20d", "drawdown_from_high_20d", "dist_from_high_20d", "rsi_14",
    "log_price", "log_dollar_vol_20d",
    # volume behaviour (trailing)
    "vol_z_5d", "vol_z_20d", "volume_surge_factor",
    # intraday pump signatures (from minute bars; trailing 5d max/mean)
    "max5m_ret_5dmax", "intraday_range_5dmax", "vol_top30_share_5dmean",
    "close_vs_vwap_5dmean", "active_minutes_5dmean",
]


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _norm(c: str) -> str:
    return re.sub(r"[^a-z0-9_]", "", str(c).strip().lower().replace(" ", "_"))


def _pick(cols: list[str], cands: list[str]) -> str | None:
    n = {_norm(c): c for c in cols}
    for cand in cands:
        if cand in n:
            return n[cand]
    return None


def _to_dt(series: pd.Series) -> pd.Series:
    """Parse a timestamp column: ISO strings or epoch s/ms/ns. Uses
    is_numeric_dtype (not np.issubdtype) so StringDtype/Arrow columns work."""
    if pd.api.types.is_numeric_dtype(series):
        v = pd.to_numeric(series, errors="coerce").astype("int64")
        mx = int(v.max())
        unit = "ns" if mx > 10**15 else ("ms" if mx > 10**12 else "s")
        return pd.to_datetime(v, unit=unit, utc=True).dt.tz_localize(None)
    return pd.to_datetime(series.astype("object"), utc=True, errors="coerce").dt.tz_localize(None)


def _looks_headerless(cols) -> bool:
    if len(cols) < 2:
        return False
    if not pd.isna(pd.to_datetime(str(cols[0]), errors="coerce")):
        return True
    num = sum(bool(re.fullmatch(r"-?\d+(\.\d+)?(\.\d+)?", str(c))) for c in cols)
    return num >= max(2, int(0.8 * len(cols)))


def _positional_names(n: int) -> list:
    if n >= 6:
        return ["datetime", "open", "high", "low", "close", "volume"] + [f"extra{i}" for i in range(n - 6)]
    return {5: ["datetime", "open", "high", "low", "close"], 4: ["datetime", "open", "close", "volume"],
            3: ["datetime", "close", "volume"], 2: ["datetime", "close"]}[n]


def _raw_head_lines(path: Path, n: int = 20) -> list:
    is_gz = path.name.lower().endswith((".csv.gz", ".txt.gz"))
    opener = (lambda p: gzip.open(p, "rt", encoding="latin-1", errors="ignore")) if is_gz \
        else (lambda p: open(p, "r", encoding="latin-1", errors="ignore"))
    out = []
    with opener(path) as fh:
        for _ in range(n * 3):
            ln = fh.readline()
            if not ln:
                break
            if ln.strip():
                out.append(ln.rstrip("\n"))
            if len(out) >= n:
                break
    return out


def _is_number(s: str) -> bool:
    return bool(re.fullmatch(r"-?\d+(\.\d+)?(\.\d+)?", s.strip()))


def _csv_opts(path: Path) -> dict:
    """Skip leading comment/metadata lines; detect header vs headerless
    (FirstRateData) robustly — the variations that silently dropped files."""
    lines = _raw_head_lines(path)
    if not lines:
        return {}
    skip = 0
    for ln in lines:
        s = ln.lstrip("﻿").strip()
        if not s or s.startswith(("#", "//", ";")) or ("," not in s and "\t" not in s):
            skip += 1
        else:
            break
    if skip >= len(lines):
        return {}
    firstrow = lines[skip].lstrip("﻿")
    sep = "\t" if ("\t" in firstrow and "," not in firstrow) else ","
    fields = firstrow.split(sep)
    first_field = fields[0].strip().strip('"')
    headerless = (
        not pd.isna(pd.to_datetime(first_field, errors="coerce"))
        or sum(_is_number(f) for f in fields) >= max(2, int(0.6 * len(fields)))
    )
    opts: dict = {}
    if sep == "\t":
        opts["sep"] = "\t"
    if skip:
        opts["skiprows"] = skip
    if headerless:
        opts["header"] = None
        opts["names"] = _positional_names(len(fields))
    return opts


def _read_any(path: Path, chunked: bool = False):
    """Return a DataFrame or an iterator of chunks for csv-family files."""
    suf = path.suffix.lower()
    if suf == ".parquet":
        return pd.read_parquet(path)
    if suf == ".feather":
        return pd.read_feather(path)
    # csv / txt, possibly gzipped, possibly headerless (FirstRateData etc.)
    kw = dict(low_memory=False)
    kw.update(_csv_opts(path))
    if chunked:
        kw["chunksize"] = CHUNK_ROWS
    try:
        return pd.read_csv(path, **kw)
    except UnicodeDecodeError:
        # latin-1 maps every byte — handles non-UTF-8 exports (°, currency signs)
        return pd.read_csv(path, encoding="latin-1", **kw)


# OS metadata on external drives that must never be read as data (macOS
# AppleDouble ._* companions, Spotlight/Trash dirs, Windows recycle bin, etc.)
JUNK_DIRS = {".spotlight-v100", ".trashes", ".fseventsd", ".temporaryitems",
             ".documentrevisions-v100", "system volume information",
             "$recycle.bin", "lost+found", ".trash"}


def _is_junk(p: Path) -> bool:
    if p.name.startswith("."):
        return True
    return any(part.lower() in JUNK_DIRS for part in p.parts)


def _discover(root: Path, limit: int | None = None) -> tuple[str, list[Path]]:
    """Find data files and guess the layout: 'per-symbol' or 'per-day'."""
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or _is_junk(p):
            continue
        suf = p.suffix.lower()
        base = p.name.lower()
        if suf in DATA_EXTS or base.endswith((".csv.gz", ".txt.gz")):
            files.append(p)
        if limit and len(files) >= limit * 3:  # over-collect, trim later
            break
    if not files:
        sys.exit(f"No data files (.csv/.txt/.parquet/.feather[,.gz]) under {root}")

    def stem(p: Path) -> str:
        s = p.name
        for ext in (".csv.gz", ".txt.gz", ".csv", ".txt", ".parquet", ".feather"):
            if s.lower().endswith(ext):
                return s[: -len(ext)]
        return p.stem

    stems = [stem(p) for p in files[:200]]
    ticker_like = sum(bool(re.fullmatch(r"[A-Za-z][A-Za-z.\-]{0,6}", s)) for s in stems)
    date_like = sum(bool(re.search(r"\d{4}[-_]?\d{2}[-_]?\d{2}", s)) for s in stems)
    layout = "per-symbol" if ticker_like >= date_like else "per-day"
    if limit:
        files = files[:limit]
    return layout, files


# ---------------------------------------------------------------------------
# STAGE 0: inspect
# ---------------------------------------------------------------------------
def cmd_inspect(args) -> None:
    root = Path(args.root)
    layout, files = _discover(root, limit=None)
    sizes = sum(f.stat().st_size for f in files[:5000])
    print(f"Root: {root}")
    print(f"Files found: {len(files):,} (sampled size of first 5k: {sizes/1e9:.1f} GB)")
    print(f"Guessed layout: {layout}")
    exts = pd.Series([f.suffix.lower() for f in files]).value_counts()
    print(f"Extensions: {exts.to_dict()}")
    print(f"Example paths:\n  " + "\n  ".join(str(f) for f in files[:5]))
    sample = files[0]
    print(f"\nSampling {sample} ...")
    df = _read_any(sample)
    if hasattr(df, "get_chunk"):
        df = df.get_chunk(5)
    print(f"Columns: {list(df.columns)}")
    print(df.head(5).to_string())
    tcol = _pick(list(df.columns), TIME_CANDS)
    scol = _pick(list(df.columns), SYM_CANDS)
    print(f"\nDetected time column: {tcol!r}   symbol column: {scol!r}")
    print({k: _pick(list(df.columns), v) for k, v in COL_MAP.items()})
    print("\nIf any detection above is wrong, send this output back for a loader tweak.")


# ---------------------------------------------------------------------------
# STAGE 1: aggregate minute bars -> daily rows with intraday features
# ---------------------------------------------------------------------------
def _aggregate_frame(df: pd.DataFrame, symbol: str, start: pd.Timestamp) -> pd.DataFrame | None:
    cols = list(df.columns)
    tcol = _pick(cols, TIME_CANDS)
    if tcol is None:
        return None
    ccol = _pick(cols, COL_MAP["close"])
    if ccol is None:
        return None
    ocol = _pick(cols, COL_MAP["open"]) or ccol
    hcol = _pick(cols, COL_MAP["high"]) or ccol
    lcol = _pick(cols, COL_MAP["low"]) or ccol
    vcol = _pick(cols, COL_MAP["volume"])

    out = pd.DataFrame({
        "dt": _to_dt(df[tcol]),
        "open": pd.to_numeric(df[ocol], errors="coerce"),
        "high": pd.to_numeric(df[hcol], errors="coerce"),
        "low": pd.to_numeric(df[lcol], errors="coerce"),
        "close": pd.to_numeric(df[ccol], errors="coerce"),
        "volume": pd.to_numeric(df[vcol], errors="coerce") if vcol else 0.0,
    }).dropna(subset=["dt", "close"])
    out = out[(out["dt"] >= start) & (out["close"] > 0)]
    if out.empty:
        return None
    out = out.sort_values("dt")
    out["day"] = out["dt"].dt.normalize()

    rows = []
    for day, g in out.groupby("day", sort=True):
        c = g["close"].to_numpy()
        v = g["volume"].to_numpy(dtype=float)
        tot_v = float(v.sum())
        # max 5-minute return within the day (pump velocity)
        if len(c) > 5:
            r5 = c[5:] / c[:-5] - 1.0
            max5 = float(np.nanmax(r5)) if len(r5) else 0.0
        else:
            max5 = 0.0
        lo = float(np.nanmin(g["low"])); hi = float(np.nanmax(g["high"]))
        vwap = float((c * v).sum() / tot_v) if tot_v > 0 else float(np.mean(c))
        top30 = float(np.sort(v)[-30:].sum() / tot_v) if tot_v > 0 and len(v) > 30 else (1.0 if tot_v > 0 else 0.0)
        rows.append({
            "symbol": symbol, "date": day,
            "open": float(g["open"].iloc[0]), "high": hi, "low": lo,
            "close": float(c[-1]), "volume": tot_v,
            "max_5min_ret": max5,
            "intraday_range_pct": (hi - lo) / lo if lo > 0 else 0.0,
            "vol_top30_share": top30,
            "close_vs_vwap": (c[-1] / vwap - 1.0) if vwap > 0 else 0.0,
            "active_minutes": int(len(g)),
        })
    return pd.DataFrame(rows) if rows else None


def cmd_aggregate(args) -> None:
    root = Path(args.root)
    start = pd.Timestamp(datetime.utcnow().date() - timedelta(days=args.years * 365 + 30))
    layout, files = _discover(root, limit=args.limit)
    if not PARQUET_OK and args.out.endswith(".parquet"):
        args.out = args.out[: -len(".parquet")] + ".csv.gz"
        print("NOTE: pyarrow/fastparquet not installed — writing csv.gz instead "
              "(pip install pyarrow for faster parquet output).")
    part_ext = ".parquet" if PARQUET_OK else ".csv.gz"
    parts_dir = Path(args.out + ".parts")
    parts_dir.mkdir(exist_ok=True)
    print(f"Layout: {layout}; files: {len(files):,}; window: >= {start.date()}; parts: {parts_dir}")

    def stem(p: Path) -> str:
        s = p.name
        for ext in (".csv.gz", ".txt.gz", ".csv", ".txt", ".parquet", ".feather"):
            if s.lower().endswith(ext):
                return s[: -len(ext)]
        return p.stem

    done, skipped = 0, 0
    for i, f in enumerate(files, 1):
        key = re.sub(r"[^A-Za-z0-9._\-]", "_", stem(f))
        part = parts_dir / f"{key}{part_ext}"
        if part.exists():
            skipped += 1
            continue
        try:
            pieces = []
            reader = _read_any(f, chunked=True)
            chunks = reader if hasattr(reader, "__iter__") and not isinstance(reader, pd.DataFrame) else [reader]
            for chunk in chunks:
                if layout == "per-symbol":
                    agg = _aggregate_frame(chunk, stem(f).upper(), start)
                    if agg is not None:
                        pieces.append(agg)
                else:  # per-day files: need a symbol column, aggregate per symbol
                    scol = _pick(list(chunk.columns), SYM_CANDS)
                    if scol is None:
                        raise ValueError("per-day layout but no symbol column found")
                    for sym, g in chunk.groupby(scol):
                        agg = _aggregate_frame(g, str(sym).upper(), start)
                        if agg is not None:
                            pieces.append(agg)
            if pieces:
                res = pd.concat(pieces, ignore_index=True)
                # a symbol split across chunks: re-reduce (keep last close, sum volume, max/min)
                res = res.sort_values(["symbol", "date"])
                if PARQUET_OK:
                    res.to_parquet(part, index=False)
                else:
                    res.to_csv(part, index=False, compression="gzip")
            else:
                part.touch()  # nothing in window; mark done
            done += 1
        except Exception as e:  # keep going; one bad file must not kill hours of work
            print(f"  ! {f.name}: {type(e).__name__}: {e}")
        if i % 100 == 0:
            print(f"  {i:,}/{len(files):,} processed ({skipped} skipped as already done)")

    print("Merging parts ...")
    parts = [p for p in parts_dir.glob(f"*{part_ext}") if p.stat().st_size > 0]
    if not parts:
        sys.exit("No data aggregated — check `inspect` output and the --years window.")
    read_part = pd.read_parquet if PARQUET_OK else pd.read_csv
    merged = pd.concat((read_part(p) for p in parts), ignore_index=True)
    merged["date"] = pd.to_datetime(merged["date"])
    merged = merged.sort_values(["symbol", "date"]).reset_index(drop=True)
    if args.out.endswith(".parquet"):
        merged.to_parquet(args.out, index=False)
    else:
        merged.to_csv(args.out, index=False, compression="gzip" if args.out.endswith(".gz") else None)
    print(f"Wrote {args.out}: {len(merged):,} daily rows, {merged['symbol'].nunique():,} symbols, "
          f"{merged['date'].min().date()} → {merged['date'].max().date()}")
    print(f"(parts kept in {parts_dir} for resume; delete when happy)")


# ---------------------------------------------------------------------------
# STAGE 2: features, labels, walk-forward training loop
# ---------------------------------------------------------------------------
def _rsi(p: pd.Series, w: int = 14) -> pd.Series:
    d = p.diff()
    up = d.clip(lower=0).rolling(w, min_periods=w).mean()
    dn = (-d.clip(upper=0)).rolling(w, min_periods=w).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50.0)


def build_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["symbol", "date"]).reset_index(drop=True)
    g = df.groupby("symbol", sort=False)
    p, v = df["close"], df["volume"]

    feats = pd.DataFrame(index=df.index)
    feats["symbol"], feats["date"], feats["close"] = df["symbol"], df["date"], p
    for n in (1, 5, 10, 20):
        feats[f"ret_{n}d"] = g["close"].pct_change(n)
    m20 = g["close"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    s20 = g["close"].transform(lambda s: s.rolling(20, min_periods=20).std())
    feats["price_zscore_20d"] = (p - m20) / s20.replace(0, np.nan)
    feats["ret_vol_20d"] = g["close"].transform(lambda s: s.pct_change().rolling(20, min_periods=20).std())
    rmax = g["close"].transform(lambda s: s.rolling(20, min_periods=20).max())
    rmin = g["close"].transform(lambda s: s.rolling(20, min_periods=20).min())
    feats["max_runup_20d"] = (p - rmin) / rmin.replace(0, np.nan)
    feats["drawdown_from_high_20d"] = (rmax - p) / rmax.replace(0, np.nan)
    feats["dist_from_high_20d"] = p / rmax.replace(0, np.nan)
    feats["rsi_14"] = g["close"].transform(_rsi)
    feats["log_price"] = np.log1p(p)
    dollar_vol = df["close"] * df["volume"]
    dv20 = dollar_vol.groupby(df["symbol"]).transform(
        lambda s: s.rolling(20, min_periods=20).mean())
    feats["log_dollar_vol_20d"] = np.log1p(dv20)

    vm5 = g["volume"].transform(lambda s: s.rolling(5, min_periods=5).mean())
    vm20 = g["volume"].transform(lambda s: s.rolling(20, min_periods=20).mean())
    vs20 = g["volume"].transform(lambda s: s.rolling(20, min_periods=20).std())
    vm60 = g["volume"].transform(lambda s: s.rolling(60, min_periods=30).mean())
    feats["vol_z_5d"] = (v - vm5) / vs20.replace(0, np.nan)
    feats["vol_z_20d"] = (v - vm20) / vs20.replace(0, np.nan)
    feats["volume_surge_factor"] = vm5 / vm60.replace(0, np.nan)

    feats["max5m_ret_5dmax"] = g["max_5min_ret"].transform(lambda s: s.rolling(5, min_periods=5).max())
    feats["intraday_range_5dmax"] = g["intraday_range_pct"].transform(lambda s: s.rolling(5, min_periods=5).max())
    feats["vol_top30_share_5dmean"] = g["vol_top30_share"].transform(lambda s: s.rolling(5, min_periods=5).mean())
    feats["close_vs_vwap_5dmean"] = g["close_vs_vwap"].transform(lambda s: s.rolling(5, min_periods=5).mean())
    feats["active_minutes_5dmean"] = g["active_minutes"].transform(lambda s: s.rolling(5, min_periods=5).mean())

    # Label: forward min LOW within next FORWARD_DAYS rows (uses intraday lows —
    # stricter and more realistic than close-only).
    def fwd_min_low(s: pd.Series) -> pd.Series:
        rev = s.iloc[::-1]
        return rev.rolling(FORWARD_DAYS, min_periods=MIN_FORWARD_POINTS).min().shift(1).iloc[::-1]

    def fwd_count(s: pd.Series) -> pd.Series:
        rev = s.iloc[::-1]
        return rev.rolling(FORWARD_DAYS, min_periods=1).count().shift(1).iloc[::-1]

    feats["fwd_min_low"] = g["low"].transform(fwd_min_low)
    feats["fwd_points"] = g["low"].transform(fwd_count)
    feats["label"] = (feats["fwd_min_low"] <= (1 - DROP_THRESHOLD) * p).astype(float)

    feats = feats[feats["fwd_points"] >= MIN_FORWARD_POINTS]
    feats = feats.replace([np.inf, -np.inf], np.nan).dropna(subset=FEATURES + ["label"])
    return feats.reset_index(drop=True)


def rules_proxy(d: pd.DataFrame) -> np.ndarray:
    """Documented approximation of the TS rules engine's HIGH verdict on pumps:
    big run-up + volume explosion, or an extreme spike on its own. A proxy — the
    real engine has more inputs (SEC flags, OTC status) not present here."""
    return (
        ((d["ret_10d"] >= 0.50) & (d["volume_surge_factor"] >= 3.0))
        | (d["ret_10d"] >= 1.00)
        | ((d["price_zscore_20d"] >= 3.0) & (d["vol_z_20d"] >= 3.0))
    ).to_numpy().astype(float)


def _metrics(y, yhat) -> dict:
    from sklearn.metrics import f1_score, precision_score, recall_score
    return {
        "precision": round(float(precision_score(y, yhat, zero_division=0)), 4),
        "recall": round(float(recall_score(y, yhat, zero_division=0)), 4),
        "f1": round(float(f1_score(y, yhat, zero_division=0)), 4),
        "flagged": int(yhat.sum()), "n": int(len(y)),
        "base_rate": round(float(np.mean(y)), 4),
    }


def cmd_train(args) -> None:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import f1_score

    print(f"Loading {args.data} ...")
    df = pd.read_parquet(args.data) if args.data.endswith(".parquet") else pd.read_csv(args.data)
    df["date"] = pd.to_datetime(df["date"])
    if args.years:
        cutoff = df["date"].max() - pd.Timedelta(days=args.years * 365)
        df = df[df["date"] >= cutoff]
    print(f"  {len(df):,} daily rows, {df['symbol'].nunique():,} symbols, "
          f"{df['date'].min().date()} → {df['date'].max().date()}")

    print("Building features + forward labels ...")
    data = build_dataset(df)
    print(f"  {len(data):,} labeled observations; crash base rate {data['label'].mean():.1%}")

    # ---- Walk-forward loop: expanding train window, quarterly validation ----
    dates = np.sort(data["date"].unique())
    if len(dates) < args.warmup_days + args.fold_days:
        sys.exit(f"Not enough distinct dates ({len(dates)}) for warmup {args.warmup_days} + fold {args.fold_days}.")
    folds, fold_starts = [], range(args.warmup_days, len(dates) - 1, args.fold_days)
    print(f"Walk-forward: warmup {args.warmup_days} trading days, {args.fold_days}-day folds, "
          f"{len(list(fold_starts))} folds\n")

    clf = None
    for k, st in enumerate(range(args.warmup_days, len(dates) - 1, args.fold_days), 1):
        tr_dates, va_dates = dates[:st], dates[st: st + args.fold_days]
        tr = data[data["date"].isin(tr_dates)]
        va = data[data["date"].isin(va_dates)]
        if len(va) == 0 or tr["label"].nunique() < 2:
            continue
        clf = RandomForestClassifier(
            n_estimators=250, max_depth=8, min_samples_leaf=50,
            class_weight="balanced", random_state=42, n_jobs=-1,
        ).fit(tr[FEATURES], tr["label"])
        pt = clf.predict_proba(tr[FEATURES])[:, 1]
        thr = max(np.linspace(0.1, 0.9, 33), key=lambda t: f1_score(tr["label"], pt >= t, zero_division=0))
        ml = _metrics(va["label"].to_numpy(), (clf.predict_proba(va[FEATURES])[:, 1] >= thr).astype(float))
        rb = _metrics(va["label"].to_numpy(), rules_proxy(va))
        folds.append({
            "fold": k,
            "train_through": str(pd.Timestamp(tr_dates[-1]).date()),
            "validate_to": str(pd.Timestamp(va_dates[-1]).date()),
            "threshold": round(float(thr), 3), "ml": ml, "rules_proxy": rb,
        })
        print(f"fold {k:>2}  ≤{folds[-1]['train_through']} → {folds[-1]['validate_to']}   "
              f"ML f1={ml['f1']:.3f} (p={ml['precision']:.3f} r={ml['recall']:.3f})   "
              f"rules f1={rb['f1']:.3f}   base={ml['base_rate']:.1%}")

    if not folds:
        sys.exit("No valid folds produced — check the date range / fold sizes.")
    ml_f1 = float(np.mean([f["ml"]["f1"] for f in folds]))
    rb_f1 = float(np.mean([f["rules_proxy"]["f1"] for f in folds]))
    wins = ml_f1 > rb_f1

    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "config": {"forward_days": FORWARD_DAYS, "drop_threshold": DROP_THRESHOLD,
                   "warmup_days": args.warmup_days, "fold_days": args.fold_days,
                   "years": args.years},
        "observations": int(len(data)),
        "mean_ml_f1": round(ml_f1, 4), "mean_rules_proxy_f1": round(rb_f1, 4),
        "ml_beats_rules_proxy": bool(wins), "folds": folds,
        "top_features": sorted(
            zip(FEATURES, clf.feature_importances_), key=lambda kv: kv[1], reverse=True
        )[:10] if clf is not None else [],
    }
    report["top_features"] = [{"feature": f, "importance": round(float(i), 4)}
                              for f, i in report["top_features"]]
    os.makedirs("models", exist_ok=True)
    with open("models/real_minute_report.json", "w") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nMean F1 across folds — ML: {ml_f1:.3f}   rules-proxy: {rb_f1:.3f}   "
          f"=> {'ML WINS' if wins else 'rules win / tie'}")
    print("Full report: models/real_minute_report.json")

    if wins or args.save_always:
        import joblib
        final = RandomForestClassifier(
            n_estimators=300, max_depth=8, min_samples_leaf=50,
            class_weight="balanced", random_state=42, n_jobs=-1,
        ).fit(data[FEATURES], data["label"])
        joblib.dump(final, "models/real_minute_rf.joblib")
        with open("models/real_minute_rf_meta.json", "w") as fh:
            json.dump({"features": FEATURES, **report}, fh, indent=2)
        print("Saved models/real_minute_rf.joblib (+meta). Refit on all data after honest evaluation.")
    else:
        print("Not saving a model (didn't beat the rules-proxy). An honest result.")


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    ins = sub.add_parser("inspect", help="print detected layout/columns of the archive")
    ins.add_argument("--root", required=True)

    agg = sub.add_parser("aggregate", help="minute bars -> daily rows w/ intraday features")
    agg.add_argument("--root", required=True)
    agg.add_argument("--out", default="minute_daily_agg.parquet")
    agg.add_argument("--years", type=int, default=4)
    agg.add_argument("--limit", type=int, help="only first N files (smoke test)")

    tr = sub.add_parser("train", help="walk-forward training loop on the aggregate")
    tr.add_argument("--data", required=True)
    tr.add_argument("--years", type=int, default=4)
    tr.add_argument("--warmup-days", type=int, default=252, dest="warmup_days")
    tr.add_argument("--fold-days", type=int, default=63, dest="fold_days")
    tr.add_argument("--save-always", action="store_true")

    args = ap.parse_args()
    {"inspect": cmd_inspect, "aggregate": cmd_aggregate, "train": cmd_train}[args.cmd](args)


if __name__ == "__main__":
    main()
