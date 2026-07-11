"""
ScamDunk AI trainer — ONE-FILE, fully automatic.

WHAT IT DOES (all by itself, with a couple of Y/n prompts):
  1. Installs its own Python dependencies into a private venv (no setup needed).
  2. Finds your external drive (or you paste the path) and checks the data format.
  3. Runs a 2-minute smoke test so hours aren't wasted on a wrong guess.
  4. Reduces the minute bars (last 4 years) to daily rows with intraday
     pump signatures. Resumable — Ctrl-C any time and re-run, it continues.
  5. Runs a walk-forward training loop (train on the past, validate on the
     next quarter, step forward) against a rules baseline.
  6. Writes a folder "ScamDunk_AI_Results" next to this file with a
     plain-English RESULTS_SUMMARY.txt — send that (and report.json) to Claude.

HOW TO RUN (the only manual step):
  Mac:      open Terminal, type:  python3   then a space, drag this file into
            the window, press Enter.
  Windows:  open Command Prompt, type:  python   then a space, drag this file
            in, press Enter.

That's it. Everything else is automatic.
(Power users: --root PATH --yes for non-interactive; --years N to change window.)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Step 0: self-bootstrap a venv with dependencies, then re-exec inside it.
# Handles fresh Macs/PCs and PEP-668 "externally managed" Pythons.
# ---------------------------------------------------------------------------
DEPS = ["pandas", "numpy", "scikit-learn", "joblib", "pyarrow"]
VENV_DIR = Path.home() / ".scamdunk_ai_venv"


def _venv_python() -> Path:
    return VENV_DIR / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _ensure_deps() -> None:
    try:
        import pandas, numpy, sklearn, joblib  # noqa: F401
        return  # already usable in this interpreter
    except ImportError:
        pass
    py = _venv_python()
    if not py.exists():
        print("First run: setting up a private Python environment (one time, ~2 min)...")
        import venv
        venv.create(VENV_DIR, with_pip=True)
    print("Installing/updating required packages (pandas, scikit-learn, ...)")
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet", "--upgrade", "pip"])
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet"] + DEPS)
    print("Environment ready — continuing.\n")
    os.execv(str(py), [str(py), os.path.abspath(__file__)] + sys.argv[1:])


if __name__ == "__main__":
    _ensure_deps()

import numpy as np                      # noqa: E402
import pandas as pd                     # noqa: E402

try:
    import pyarrow  # noqa: F401
    PARQUET_OK = True
except ImportError:
    PARQUET_OK = False

# ---------------------------------------------------------------------------
# Config (kept in sync with python_ai/train_from_minute_data.py)
# ---------------------------------------------------------------------------
# Bump whenever parsing/aggregation logic changes: cached results stamped with
# an older version are automatically discarded (stale caches once silently
# defeated a parser fix — never again).
VERSION = "3"
PARSER_VERSION = VERSION

FORWARD_DAYS = 22
DROP_THRESHOLD = 0.40
MIN_FORWARD_POINTS = 10
CHUNK_ROWS = 1_000_000
DATA_EXTS = {".csv", ".txt", ".parquet", ".feather"}
TIME_CANDS = ["timestamp", "datetime", "date_time", "time", "ts", "t", "window_start", "date"]
SYM_CANDS = ["symbol", "ticker", "sym", "code"]
COL_MAP = {
    "open": ["open", "o"], "high": ["high", "h"], "low": ["low", "l"],
    "close": ["close", "c", "price", "last", "adj_close", "adjclose"],
    "volume": ["volume", "v", "vol", "size"],
}
FEATURES = [
    "ret_1d", "ret_5d", "ret_10d", "ret_20d", "price_zscore_20d", "ret_vol_20d",
    "max_runup_20d", "drawdown_from_high_20d", "dist_from_high_20d", "rsi_14",
    "log_price", "log_dollar_vol_20d", "vol_z_5d", "vol_z_20d", "volume_surge_factor",
    "max5m_ret_5dmax", "intraday_range_5dmax", "vol_top30_share_5dmean",
    "close_vs_vwap_5dmean", "active_minutes_5dmean",
]

RESULTS_DIR = Path(__file__).resolve().parent / "ScamDunk_AI_Results"


def say(msg: str = "") -> None:
    print(msg, flush=True)


def ask_yn(q: str, auto_yes: bool) -> bool:
    if auto_yes:
        say(f"{q} [auto-yes]")
        return True
    return input(f"{q} [Y/n] ").strip().lower() not in ("n", "no")


# ---------------------------------------------------------------------------
# Format helpers (identical logic to the repo pipeline)
# ---------------------------------------------------------------------------
def _norm(c: str) -> str:
    return re.sub(r"[^a-z0-9_]", "", str(c).strip().lower().replace(" ", "_"))


def _pick(cols, cands):
    n = {_norm(c): c for c in cols}
    for cand in cands:
        if cand in n:
            return n[cand]
    return None


def _to_dt(series: pd.Series) -> pd.Series:
    # is_numeric_dtype (not np.issubdtype) so this is robust to pandas'
    # StringDtype/Arrow-backed columns, which np.issubdtype can't interpret.
    if pd.api.types.is_numeric_dtype(series):
        v = pd.to_numeric(series, errors="coerce").astype("int64")
        mx = int(v.max())
        unit = "ns" if mx > 10**15 else ("ms" if mx > 10**12 else "s")
        return pd.to_datetime(v, unit=unit, utc=True).dt.tz_localize(None)
    return pd.to_datetime(
        series.astype("object"), utc=True, errors="coerce"
    ).dt.tz_localize(None)


def _looks_headerless(cols) -> bool:
    """True when the 'column names' are actually a data row — i.e. the file has
    no header (FirstRateData-style: datetime,open,high,low,close,volume)."""
    if len(cols) < 2:
        return False
    if not pd.isna(pd.to_datetime(str(cols[0]), errors="coerce")):
        return True  # first "name" parses as a timestamp
    num = sum(bool(re.fullmatch(r"-?\d+(\.\d+)?(\.\d+)?", str(c))) for c in cols)
    return num >= max(2, int(0.8 * len(cols)))  # names are mostly numbers


def _positional_names(n: int) -> list[str]:
    if n >= 6:
        return ["datetime", "open", "high", "low", "close", "volume"] + [
            f"extra{i}" for i in range(n - 6)]
    return {5: ["datetime", "open", "high", "low", "close"],
            4: ["datetime", "open", "close", "volume"],
            3: ["datetime", "close", "volume"],
            2: ["datetime", "close"]}[n]


def _raw_head_lines(path: Path, n: int = 20) -> list:
    """First n non-empty raw lines, latin-1 (robust), for sniffing structure."""
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
    """Decide how to read a csv/txt: skip leading comment/metadata lines and
    detect whether the first REAL line is a header or already data (headerless,
    FirstRateData-style). Robust to '#' / '//' / ';' comments, blank lines, a
    BOM, and tab separators — the format variations that were silently dropping
    files that actually had data."""
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


def _read_any(path: Path, chunked: bool = False, nrows: int | None = None):
    suf = path.suffix.lower()
    if suf == ".parquet":
        return pd.read_parquet(path)
    if suf == ".feather":
        return pd.read_feather(path)
    kw = dict(low_memory=False)
    kw.update(_csv_opts(path))  # headerless detection (FirstRateData etc.)
    if chunked:
        kw["chunksize"] = CHUNK_ROWS
    if nrows:
        kw["nrows"] = nrows
    try:
        return pd.read_csv(path, **kw)
    except UnicodeDecodeError:
        # Not UTF-8 (exports from some tools are latin-1 / cp1252, e.g. a ° in a
        # header). latin-1 maps every byte, so this can't raise the same error.
        return pd.read_csv(path, encoding="latin-1", **kw)


def _stem(p: Path) -> str:
    s = p.name
    for ext in (".csv.gz", ".txt.gz", ".csv", ".txt", ".parquet", ".feather"):
        if s.lower().endswith(ext):
            return s[: -len(ext)]
    return p.stem


def _file_symbol(p: Path) -> str:
    """Ticker from a filename: 'GAA_full_1min_adjsplitdiv.txt' -> 'GAA',
    'AAPL.csv' -> 'AAPL', 'BRK.A_full_1min.txt' -> 'BRK.A'."""
    tok = _stem(p).split("_")[0].upper()
    return tok or _stem(p).upper()


# OS metadata that lives on external drives and must never be read as data:
# macOS AppleDouble companions (._*), .DS_Store, Spotlight/Trash/fsevents dirs,
# Windows recycle bin / system info, Linux lost+found.
JUNK_DIRS = {".spotlight-v100", ".trashes", ".fseventsd", ".temporaryitems",
             ".documentrevisions-v100", "system volume information",
             "$recycle.bin", "lost+found", ".trash"}


def _is_junk(p: Path) -> bool:
    if p.name.startswith("."):  # ._AAPL.csv, .DS_Store, any hidden file
        return True
    return any(part.lower() in JUNK_DIRS for part in p.parts)


def discover(root: Path, limit: int | None = None):
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or _is_junk(p):
            continue
        if p.suffix.lower() in DATA_EXTS or p.name.lower().endswith((".csv.gz", ".txt.gz")):
            files.append(p)
            if limit and len(files) >= limit:
                break
    # Judge ticker-likeness on the FIRST underscore token so vendor suffixes
    # ("GAA_full_1min_adjsplitdiv") still register as per-symbol files.
    stems = [_file_symbol(p) for p in files[:200]]
    ticker_like = sum(bool(re.fullmatch(r"[A-Za-z][A-Za-z.\-]{0,6}", s)) for s in stems)
    date_like = sum(bool(re.search(r"\d{4}[-_]?\d{2}[-_]?\d{2}", s)) for s in stems)
    layout = "per-symbol" if ticker_like >= date_like else "per-day"
    return layout, files


# ---------------------------------------------------------------------------
# Drive detection
# ---------------------------------------------------------------------------
def find_drive(auto_yes: bool, root_arg: str | None) -> Path:
    if root_arg:
        p = Path(root_arg).expanduser()
        if not p.exists():
            sys.exit(f"Path does not exist: {p}")
        return p
    candidates = []
    for base in ("/Volumes", f"/media/{os.environ.get('USER','')}", "/media", "/mnt"):
        b = Path(base)
        if b.is_dir():
            for d in sorted(b.iterdir()):
                if d.is_dir() and not d.name.startswith(".") and d.name not in ("Macintosh HD", "skills"):
                    candidates.append(d)
    if os.name == "nt":
        for letter in "DEFGHIJ":
            d = Path(f"{letter}:/")
            if d.exists():
                candidates.append(d)
    say("\nWhere is the stock data?")
    for i, c in enumerate(candidates, 1):
        say(f"  {i}. {c}")
    say(f"  {len(candidates)+1}. Type a folder path myself")
    while True:
        choice = input("Pick a number: ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(candidates):
            return candidates[int(choice) - 1]
        if choice.isdigit() and int(choice) == len(candidates) + 1:
            p = Path(input("Folder path: ").strip().strip('"').strip("'")).expanduser()
            if p.exists():
                return p
            say("That path doesn't exist — try again.")
        else:
            say("Please enter one of the numbers above.")


# ---------------------------------------------------------------------------
# Aggregation (minute bars -> daily rows with intraday features), resumable
# ---------------------------------------------------------------------------
def _aggregate_frame(df: pd.DataFrame, symbol: str, start: pd.Timestamp):
    cols = list(df.columns)
    tcol = _pick(cols, TIME_CANDS)
    ccol = _pick(cols, COL_MAP["close"])
    if tcol is None or ccol is None:
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
        max5 = float(np.nanmax(c[5:] / c[:-5] - 1.0)) if len(c) > 5 else 0.0
        lo = float(np.nanmin(g["low"])); hi = float(np.nanmax(g["high"]))
        vwap = float((c * v).sum() / tot_v) if tot_v > 0 else float(np.mean(c))
        top30 = float(np.sort(v)[-30:].sum() / tot_v) if tot_v > 0 and len(v) > 30 else (1.0 if tot_v > 0 else 0.0)
        rows.append({
            "symbol": symbol, "date": day,
            "open": float(g["open"].iloc[0]), "high": hi, "low": lo,
            "close": float(c[-1]), "volume": tot_v, "max_5min_ret": max5,
            "intraday_range_pct": (hi - lo) / lo if lo > 0 else 0.0,
            "vol_top30_share": top30,
            "close_vs_vwap": (c[-1] / vwap - 1.0) if vwap > 0 else 0.0,
            "active_minutes": int(len(g)),
        })
    return pd.DataFrame(rows) if rows else None


def aggregate(root: Path, out_file: Path, years: int, limit: int | None = None) -> Path | None:
    start = pd.Timestamp(datetime.utcnow().date() - timedelta(days=years * 365 + 30))
    layout, files = discover(root, limit=limit)
    if not files:
        say(f"No data files found under {root}.")
        return None
    part_ext = ".parquet" if PARQUET_OK else ".csv.gz"
    parts_dir = Path(str(out_file) + ".parts")
    parts_dir.mkdir(parents=True, exist_ok=True)
    # Cache validity: cached results made by an OLDER parser version are wrong
    # (e.g. the version that silently dropped files) — wipe them automatically
    # so a fix can never be defeated by a stale cache. No manual folder
    # deleting, ever.
    stamp = parts_dir / "PARSER_VERSION.txt"
    if not stamp.exists() or stamp.read_text().strip() != PARSER_VERSION:
        if any(parts_dir.iterdir()):
            say("Found cached results from an older version of this script — "
                "clearing them and re-crunching fresh (this is automatic and correct).")
        import shutil
        shutil.rmtree(parts_dir, ignore_errors=True)
        parts_dir.mkdir(parents=True, exist_ok=True)
        stamp.write_text(PARSER_VERSION)
    say(f"Found {len(files):,} files (layout: {layout}). Keeping data from {start.date()} onward.")
    t0, done_new = time.time(), 0
    for i, f in enumerate(files, 1):
        key = re.sub(r"[^A-Za-z0-9._\-]", "_", _stem(f))
        part = parts_dir / f"{key}{part_ext}"
        if part.exists():
            continue
        try:
            pieces = []
            reader = _read_any(f, chunked=True)
            chunks = reader if hasattr(reader, "__iter__") and not isinstance(reader, pd.DataFrame) else [reader]
            for chunk in chunks:
                if layout == "per-symbol":
                    a = _aggregate_frame(chunk, _file_symbol(f), start)
                    if a is not None:
                        pieces.append(a)
                else:
                    scol = _pick(list(chunk.columns), SYM_CANDS)
                    if scol is None:
                        raise ValueError("no symbol column in per-day file")
                    for sym, g in chunk.groupby(scol):
                        a = _aggregate_frame(g, str(sym).upper(), start)
                        if a is not None:
                            pieces.append(a)
            # Self-heal: if the workspace was deleted mid-run (Finder cleanup,
            # a second window, cloud-sync tidy-up), recreate it instead of
            # failing every remaining file with 'non-existent directory'.
            parts_dir.mkdir(parents=True, exist_ok=True)
            if not stamp.exists():
                stamp.write_text(PARSER_VERSION)
            if pieces:
                res = pd.concat(pieces, ignore_index=True).sort_values(["symbol", "date"])
                if PARQUET_OK:
                    res.to_parquet(part, index=False)
                else:
                    res.to_csv(part, index=False, compression="gzip")
            else:
                part.touch()
            done_new += 1
        except KeyboardInterrupt:
            say("\nPaused. Run this again any time — it continues where it left off.")
            sys.exit(0)
        except Exception as e:
            say(f"  ! skipping {f.name}: {type(e).__name__}: {e}")
        if i % 100 == 0:
            rate = done_new / max(time.time() - t0, 1)
            def _partpath(x: Path) -> Path:
                return parts_dir / (re.sub(r"[^A-Za-z0-9._\-]", "_", _stem(x)) + part_ext)
            remaining = sum(1 for x in files[i:] if not _partpath(x).exists())
            eta_min = remaining / max(rate, 0.01) / 60
            say(f"  {i:,}/{len(files):,} done — about {eta_min:,.0f} min remaining")
    say("Combining results ...")
    read_part = pd.read_parquet if PARQUET_OK else pd.read_csv
    parts = [p for p in parts_dir.glob(f"*{part_ext}") if p.stat().st_size > 0]
    if not parts:
        say("No rows survived — the data may be older than the window, or in an unrecognized format.")
        return None
    merged = pd.concat((read_part(p) for p in parts), ignore_index=True)
    merged["date"] = pd.to_datetime(merged["date"])
    merged = merged.sort_values(["symbol", "date"]).reset_index(drop=True)
    if PARQUET_OK:
        merged.to_parquet(out_file, index=False)
    else:
        out_file = out_file.with_suffix(".csv.gz")
        merged.to_csv(out_file, index=False, compression="gzip")
    n_symbols = merged["symbol"].nunique()
    say(f"Daily dataset ready: {out_file.name} — {len(merged):,} rows, "
        f"{n_symbols:,} symbols, {merged['date'].min().date()} → {merged['date'].max().date()}")
    if merged["active_minutes"].median() < 10:
        say("NOTE: data looks like daily (not minute) bars — training still works, "
            "but intraday features will carry little signal.")
    # Self-check coverage: if far fewer symbols survived than files exist, find
    # out whether the rest are genuinely old or were dropped by a format quirk.
    if limit is None and n_symbols < 0.5 * len(files):
        say(f"\nCoverage check ({n_symbols:,} symbols from {len(files):,} files) ...")
        recent_dropped, sampled = 0, 0
        survived_keys = {p.stem for p in parts_dir.glob(f"*{part_ext}") if p.stat().st_size > 0}
        for f in files[:: max(1, len(files) // 200)]:
            key = re.sub(r"[^A-Za-z0-9._\-]", "_", _stem(f))
            if key in survived_keys:
                continue
            sampled += 1
            try:
                _first, last = _first_last_lines(f)
                if pd.notna(_line_timestamp(last)) and _line_timestamp(last) >= start:
                    recent_dropped += 1
            except Exception:
                pass
        if recent_dropped > sampled * 0.1:
            say(f"  WARNING: ~{recent_dropped}/{sampled} sampled skipped files still "
                "have recent data — some are being dropped by format. Run once with "
                "--diagnose and send Claude the output.")
        else:
            say("  OK: the skipped files genuinely have no recent data (correctly excluded).")
    return out_file


# ---------------------------------------------------------------------------
# Features, labels, walk-forward training loop
# ---------------------------------------------------------------------------
def _rsi(p: pd.Series, w: int = 14) -> pd.Series:
    d = p.diff()
    up = d.clip(lower=0).rolling(w, min_periods=w).mean()
    dn = (-d.clip(upper=0)).rolling(w, min_periods=w).mean()
    return (100 - 100 / (1 + up / dn.replace(0, np.nan))).fillna(50.0)


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


def train(agg_file: Path, years: int) -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import f1_score
    import joblib

    say("Loading the daily dataset ...")
    df = pd.read_parquet(agg_file) if agg_file.suffix == ".parquet" else pd.read_csv(agg_file)
    df["date"] = pd.to_datetime(df["date"])
    cutoff = df["date"].max() - pd.Timedelta(days=years * 365)
    df = df[df["date"] >= cutoff]
    say(f"  {len(df):,} rows, {df['symbol'].nunique():,} symbols")

    say("Building learning examples from what ACTUALLY happened next ...")
    data = build_dataset(df)
    say(f"  {len(data):,} examples; {data['label'].mean():.1%} ended in a real >=40% crash")

    dates = np.sort(data["date"].unique())
    warmup = min(252, max(40, len(dates) // 3))
    fold = min(63, max(10, len(dates) // 6))
    if warmup < 252:
        say(f"NOTE: limited history ({len(dates)} days) — using a shorter warmup; treat results as preliminary.")
    say(f"Walk-forward loop: {warmup}-day warmup, {fold}-day validation folds\n")

    folds, clf = [], None
    for k, st in enumerate(range(warmup, len(dates) - 1, fold), 1):
        tr = data[data["date"].isin(dates[:st])]
        va = data[data["date"].isin(dates[st: st + fold])]
        if len(va) == 0 or tr["label"].nunique() < 2:
            continue
        clf = RandomForestClassifier(n_estimators=250, max_depth=8, min_samples_leaf=50,
                                     class_weight="balanced", random_state=42, n_jobs=-1
                                     ).fit(tr[FEATURES], tr["label"])
        pt = clf.predict_proba(tr[FEATURES])[:, 1]
        thr = max(np.linspace(0.1, 0.9, 33), key=lambda t: f1_score(tr["label"], pt >= t, zero_division=0))
        ml = _metrics(va["label"].to_numpy(), (clf.predict_proba(va[FEATURES])[:, 1] >= thr).astype(float))
        rb = _metrics(va["label"].to_numpy(), rules_proxy(va))
        folds.append({"fold": k, "validate_to": str(pd.Timestamp(dates[min(st + fold, len(dates)) - 1]).date()),
                      "threshold": round(float(thr), 3), "ml": ml, "rules_proxy": rb})
        say(f"  round {k:>2}  → {folds[-1]['validate_to']}   AI f1={ml['f1']:.3f}   rules f1={rb['f1']:.3f}")

    if not folds:
        sys.exit("Not enough history to run the loop — need more dates in the window.")
    ml_f1 = float(np.mean([f["ml"]["f1"] for f in folds]))
    rb_f1 = float(np.mean([f["rules_proxy"]["f1"] for f in folds]))
    wins = ml_f1 > rb_f1
    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "trainer_version": VERSION,
        "config": {"forward_days": FORWARD_DAYS, "drop_threshold": DROP_THRESHOLD,
                   "warmup_days": warmup, "fold_days": fold, "years": years},
        "stocks_analyzed": int(data["symbol"].nunique()),
        "observations": int(len(data)),
        "mean_ml_f1": round(ml_f1, 4), "mean_rules_proxy_f1": round(rb_f1, 4),
        "ml_beats_rules_proxy": bool(wins), "folds": folds,
        "top_features": [
            {"feature": f, "importance": round(float(i), 4)}
            for f, i in sorted(zip(FEATURES, clf.feature_importances_), key=lambda kv: kv[1], reverse=True)[:10]
        ] if clf is not None else [],
    }
    RESULTS_DIR.mkdir(exist_ok=True)
    with open(RESULTS_DIR / "report.json", "w") as fh:
        json.dump(report, fh, indent=2)
    if wins:
        final = RandomForestClassifier(n_estimators=300, max_depth=8, min_samples_leaf=50,
                                       class_weight="balanced", random_state=42, n_jobs=-1
                                       ).fit(data[FEATURES], data["label"])
        joblib.dump(final, RESULTS_DIR / "trained_model.joblib")
        with open(RESULTS_DIR / "trained_model_meta.json", "w") as fh:
            json.dump({"features": FEATURES, **report}, fh, indent=2)
    return report


def write_summary(report: dict) -> None:
    ml = report["mean_ml_f1"]; rb = report["mean_rules_proxy_f1"]
    # Average precision/recall over rounds that actually contained crashes —
    # a crash-free final quarter would otherwise misleadingly read "0%".
    meaningful = [f["ml"] for f in report["folds"] if f["ml"]["base_rate"] > 0]
    if meaningful:
        prec = int(round(100 * float(np.mean([m["precision"] for m in meaningful]))))
        rec = int(round(100 * float(np.mean([m["recall"] for m in meaningful]))))
    else:
        prec = rec = 0
    lines = [
        "ScamDunk AI — training results (plain English)",
        "=" * 48, "",
        f"Trainer version: {report.get('trainer_version', '?')}   "
        f"(a full-universe run shows thousands of stocks, not ~335)",
        f"Stocks analyzed: {report.get('stocks_analyzed', '?'):,}",
        f"Learning examples used: {report['observations']:,}",
        f"Training rounds (walk-forward): {len(report['folds'])}",
        "",
        f"AI score (mean F1 across rounds):        {ml:.3f}",
        f"Rules-baseline score (same rounds):      {rb:.3f}",
        "",
        ("VERDICT: The AI model BEAT the rules baseline and was saved as "
         "trained_model.joblib." if report["ml_beats_rules_proxy"] else
         "VERDICT: The AI model did NOT beat the rules baseline. No model was "
         "saved — the honest conclusion is that the current rules already "
         "capture the signal in this data."),
        "",
        f"Across the validation rounds: of the stocks the AI flagged, about "
        f"{prec}% really crashed >=40% within ~30 days, and it caught about "
        f"{rec}% of all such crashes.",
        "",
        "NEXT STEP: send this file AND report.json (same folder) back to Claude "
        "in the chat. If the model won, Claude will wire it into the app behind "
        "a feature flag.",
    ]
    (RESULTS_DIR / "RESULTS_SUMMARY.txt").write_text("\n".join(lines))


# ---------------------------------------------------------------------------
# Diagnostic: why did only N symbols survive?  Cheaply reads each file's LAST
# timestamp (O(1) tail read, no full parse / no re-crunch) and compares
# "should survive" (has post-window data) against what actually survived.
# ---------------------------------------------------------------------------
def _first_last_lines(path: Path) -> tuple[str, str]:
    """Cheap first + last non-empty line of a text/csv file (handles .gz)."""
    if path.suffix.lower() == ".gz" or path.name.lower().endswith((".csv.gz", ".txt.gz")):
        with gzip.open(path, "rt", encoding="latin-1", errors="ignore") as fh:
            lines = [ln for ln in fh if ln.strip()]
        return (lines[0].rstrip("\n"), lines[-1].rstrip("\n")) if lines else ("", "")
    with open(path, "rb") as fh:
        first = fh.readline().decode("latin-1", "ignore")
        try:
            fh.seek(0, 2); size = fh.tell()
            fh.seek(max(0, size - 65536))
            tail = fh.read().decode("latin-1", "ignore")
        except OSError:
            tail = first
    last = next((ln for ln in reversed(tail.splitlines()) if ln.strip()), "")
    return first.strip(), last.strip()


def _line_timestamp(line: str) -> pd.Timestamp:
    if not line:
        return pd.NaT
    return pd.to_datetime(line.split(",")[0], errors="coerce")


def cmd_diagnose(root: Path, years: int) -> None:
    start = pd.Timestamp(datetime.utcnow().date() - timedelta(days=years * 365 + 30))
    layout, files = discover(root)
    say(f"Scanning {len(files):,} files for their most-recent date "
        f"(window start = {start.date()}) ...\n")

    part_ext = ".parquet" if PARQUET_OK else ".csv.gz"
    parts_dir = RESULTS_DIR / "work" / f"daily_agg.parquet.parts"
    have_parts = parts_dir.exists()

    should, actually, wrongly, unparsed = 0, 0, [], []
    for i, f in enumerate(files, 1):
        first, last = _first_last_lines(f)
        last_ts = _line_timestamp(last)
        has_recent = pd.notna(last_ts) and last_ts >= start
        if has_recent:
            should += 1
        survived = False
        if have_parts:
            key = re.sub(r"[^A-Za-z0-9._\-]", "_", _stem(f))
            p = parts_dir / f"{key}{part_ext}"
            survived = p.exists() and p.stat().st_size > 0
            if survived:
                actually += 1
        if has_recent and have_parts and not survived and len(wrongly) < 8:
            wrongly.append((f, first, last))
        if pd.isna(last_ts) and len(unparsed) < 8:
            unparsed.append((f, first, last))
        if i % 2000 == 0:
            say(f"  {i:,}/{len(files):,} ...")

    say("\n=== DIAGNOSIS ===")
    say(f"Total data files:                         {len(files):,}")
    say(f"Files with data AFTER {start.date()}:        {should:,}")
    if have_parts:
        say(f"Files that actually survived last run:    {actually:,}")
    if unparsed:
        say(f"\nFiles whose last line didn't parse as a date ({len(unparsed)} shown) — "
            "possible format mismatch:")
        for f, fi, la in unparsed:
            say(f"  {f.name}\n     first: {fi[:90]}\n     last:  {la[:90]}")
    if have_parts and wrongly:
        # Prove whether the CURRENT (hardened) parser now reads these files.
        recovered = 0
        for f, _fi, _la in wrongly:
            try:
                s = _read_any(f, nrows=500)
                if hasattr(s, "get_chunk"):
                    s = s.get_chunk(500)
                t = _pick(list(s.columns), TIME_CANDS)
                c = _pick(list(s.columns), COL_MAP["close"])
                if t and c and _to_dt(s[t]).notna().any():
                    recovered += 1
            except Exception:
                pass
        say(f"\n*** {should - actually:,} files HAVE recent data but were dropped "
            "by the PREVIOUS run.")
        say(f"    Of {len(wrongly)} sampled, the fixed parser now reads "
            f"{recovered}/{len(wrongly)}.")
        if recovered:
            say("    => The fix works. DELETE the ScamDunk_AI_Results folder and "
                "re-run the trainer to capture all of them.")
        say("\n    Examples of previously-dropped files (first/last line):")
        for f, fi, la in wrongly:
            say(f"      {f.name}\n         first: {fi[:88]}\n         last:  {la[:88]}")
        say("\n    If the fixed parser did NOT recover them, send these lines to Claude.")
    elif have_parts and should <= actually + 5:
        say("\nCONCLUSION: no bug — the files that were skipped genuinely have no "
            f"data after {start.date()}. The {actually:,} surviving symbols are all "
            "the tickers in your archive that were still trading in the window.")
    elif not have_parts:
        say(f"\n(No previous run found. {should:,} of {len(files):,} files have recent "
            "data and would be used.)")
    else:
        say(f"\nNote: {should:,} files have recent data but only {actually:,} survived — "
            "send this output to Claude to investigate.")


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", help="data folder (skips the drive picker)")
    ap.add_argument("--years", type=int, default=4)
    ap.add_argument("--yes", action="store_true", help="no prompts (requires --root)")
    ap.add_argument("--diagnose", action="store_true",
                    help="explain why only N symbols survived (fast; no re-crunch)")
    args = ap.parse_args()

    if args.diagnose:
        root = find_drive(args.yes, args.root)
        say(f"\nUsing data folder: {root}")
        cmd_diagnose(root, args.years)
        return

    say("\n" + "=" * 62)
    say(f"  ScamDunk AI trainer — automatic   ***  VERSION {VERSION}  ***")
    say("  (if this does not say VERSION 3, you are running an OLD copy)")
    say("=" * 62)
    say("This will: check your data, do a quick test, crunch the last "
        f"{args.years} years,\nrun the training loop, and write a results folder. "
        "You can Ctrl-C and\nre-run any time — it resumes.\n")

    root = find_drive(args.yes, args.root)
    say(f"\nUsing data folder: {root}")

    layout, files = discover(root, limit=500)
    if not files:
        sys.exit("No CSV/parquet/feather data files found there. If the data is in a "
                 "database or another format, tell Claude what `ls` of the folder shows.")

    # Try a handful of files for the format check — a single odd/corrupt file
    # must not kill the run before it reaches real data.
    sample, tcol, ccol, errors = None, None, None, []
    for cand in files[:8]:
        try:
            s = _read_any(cand, nrows=2000)
            if hasattr(s, "get_chunk"):
                s = s.get_chunk(2000)
            t, c = _pick(list(s.columns), TIME_CANDS), _pick(list(s.columns), COL_MAP["close"])
            if t is not None and c is not None:
                sample, tcol, ccol = s, t, c
                break
            errors.append(f"{cand.name}: columns {list(s.columns)[:8]}")
        except Exception as e:
            errors.append(f"{cand.name}: {type(e).__name__}: {e}")
    if sample is None:
        sys.exit("Couldn't recognize the data format in the first files. "
                 "Send Claude these lines:\n  " + "\n  ".join(errors[:8]))
    say(f"Format check: {len(files):,}+ files, layout looks like '{layout}', "
        f"time column: {tcol!r}, price column: {ccol!r}")
    if not ask_yn("Look right? Start the quick 2-minute test?", args.yes):
        sys.exit(0)

    work = RESULTS_DIR / "work"
    work.mkdir(parents=True, exist_ok=True)

    say("\n--- Quick test on the first 40 files ---")
    smoke = aggregate(root, work / "smoke.parquet", args.years, limit=40)
    if smoke is None:
        sys.exit("The quick test produced no usable rows — send Claude the output above.")
    say("Quick test OK.\n")
    if not ask_yn("Run the FULL data crunch now? (hours; safe to pause with Ctrl-C)", args.yes):
        sys.exit(0)

    say("\n--- Full data crunch ---")
    agg = aggregate(root, work / "daily_agg.parquet", args.years)
    if agg is None:
        sys.exit("Aggregation produced nothing — send Claude the output above.")

    say("\n--- Training loop ---")
    report = train(agg, args.years)
    write_summary(report)

    say("\n" + "=" * 62)
    say(f"  DONE. Open this folder:\n  {RESULTS_DIR}")
    say("  Read RESULTS_SUMMARY.txt, then send it and report.json to Claude.")
    say("=" * 62)


if __name__ == "__main__":
    main()
