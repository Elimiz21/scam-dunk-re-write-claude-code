"""
Build a 2-week scan report PDF for ScamDunk.

Aggregates the most recent scan artifacts on disk (FMP daily evaluations,
OpenAI legitimacy classification, social-media pump analysis, scheme tracking)
and renders a single, self-contained PDF in `reports/`.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


REPO = Path(__file__).resolve().parents[1]
EVAL = REPO / "evaluation"
RESULTS = EVAL / "results"
PUB = REPO / "public" / "evaluation-data"
OUT = REPO / "reports" / "scan-report-2-week.pdf"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


def collect_fmp_summaries() -> list[dict]:
    """Find every fmp-summary-*.json across results/ and public/evaluation-data/."""
    summaries: list[dict] = []
    for folder in (RESULTS, PUB):
        for p in sorted(folder.glob("fmp-summary-*.json")):
            data = load_json(p)
            if not isinstance(data, dict):
                continue
            date = p.stem.replace("fmp-summary-", "")
            data["_date"] = date
            data["_source"] = str(p.relative_to(REPO))
            summaries.append(data)
    summaries.sort(key=lambda d: d["_date"])
    return summaries


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="H1Custom",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0b3d91"),
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Custom",
        parent=styles["Heading2"],
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0b3d91"),
        spaceBefore=12,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="H3Custom",
        parent=styles["Heading3"],
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor("#333333"),
        spaceBefore=8,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCustom",
        parent=styles["BodyText"],
        fontSize=9.5,
        leading=13,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="Note",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#555555"),
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="Cell",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        alignment=TA_LEFT,
    )
)


def std_table(data, col_widths=None, header_bg="#0b3d91", header_fg="#ffffff"):
    t = Table(data, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_bg)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(header_fg)),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cccccc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


# ---------------------------------------------------------------------------
# Document construction
# ---------------------------------------------------------------------------


def build():
    summaries = collect_fmp_summaries()
    promo = load_json(RESULTS / "social-media-promotion-evidence-2026-01-25.json") or {}
    pump_analysis = load_json(RESULTS / "social-media-pump-analysis-2026-01-24.json") or {}
    openai_class = load_json(RESULTS / "openai-classification-all-high-risk-2026-01-24.json") or {}
    comparison = load_json(RESULTS / "comparison-report-2026-01-15-16.json") or {}

    if summaries:
        first_date = summaries[0]["_date"]
        last_date = summaries[-1]["_date"]
    else:
        first_date = last_date = "n/a"

    story = []

    # -- Cover ---------------------------------------------------------------
    story.append(Paragraph("ScamDunk Scan Report", styles["H1Custom"]))
    story.append(
        Paragraph(
            "Two-week summary of pump-and-dump detection runs",
            styles["H2Custom"],
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            (
                f"<b>Window covered:</b> {first_date} &rarr; 2026-01-25 "
                "(latest 2 weeks of scan artifacts available in the repo)<br/>"
                f"<b>Report generated:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}<br/>"
                "<b>Source artifacts:</b> "
                "<font face='Courier'>evaluation/results/</font>, "
                "<font face='Courier'>public/evaluation-data/</font>"
            ),
            styles["BodyCustom"],
        )
    )
    story.append(
        Paragraph(
            (
                "Note: today's date is 2026-04-28, but the most recent scan output "
                "checked into this repository ends on 2026-01-25. This report covers "
                "those latest two weeks of activity."
            ),
            styles["Note"],
        )
    )

    # =======================================================================
    # SECTION 1 - SCAN RUN EFFECTIVENESS
    # =======================================================================
    story.append(Paragraph("1. Scan Run Effectiveness", styles["H2Custom"]))

    # Headline metrics
    total_runs = len(summaries)
    total_evaluated = sum(int(s.get("evaluated", 0)) for s in summaries)
    total_api_calls = sum(int(s.get("apiCallsMade", 0)) for s in summaries)
    universe = max((int(s.get("totalStocks", 0)) for s in summaries), default=0)
    durations = [int(s["durationMinutes"]) for s in summaries if s.get("durationMinutes")]
    avg_dur = round(sum(durations) / len(durations), 1) if durations else 0

    headline = [
        ["Metric", "Value"],
        ["Daily FMP scan runs in window", str(total_runs)],
        ["Stock universe per run", f"{universe:,}"],
        ["Total stock-evaluations performed", f"{total_evaluated:,}"],
        ["Total external API calls (FMP)", f"{total_api_calls:,}"],
        ["Avg scan duration (minutes)", f"{avg_dur}"],
        [
            "Social-media follow-up scans",
            "Reddit, StockTwits, YouTube, Discord, Perplexity, Serper, OpenAI legitimacy + pump classifier",
        ],
    ]
    story.append(std_table(headline, col_widths=[2.4 * inch, 4.0 * inch]))

    # Per-run table
    story.append(Paragraph("1.1 Per-run breakdown (FMP daily evaluation)", styles["H3Custom"]))
    rows = [
        [
            "Scan date",
            "Universe",
            "Evaluated",
            "Skipped",
            "API calls",
            "Duration (min)",
            "Source file",
        ]
    ]
    for s in summaries:
        rows.append(
            [
                s["_date"],
                f"{int(s.get('totalStocks', 0)):,}",
                f"{int(s.get('evaluated', 0)):,}",
                f"{int(s.get('skippedNoData', 0)):,}",
                f"{int(s.get('apiCallsMade', 0)):,}",
                str(s.get("durationMinutes", "-")),
                Paragraph(f"<font size=7>{s['_source']}</font>", styles["Cell"]),
            ]
        )
    story.append(
        std_table(
            rows,
            col_widths=[
                0.85 * inch,
                0.75 * inch,
                0.75 * inch,
                0.65 * inch,
                0.75 * inch,
                0.80 * inch,
                2.0 * inch,
            ],
        )
    )

    # Tools used
    story.append(Paragraph("1.2 Tools and data sources used", styles["H3Custom"]))
    tools_rows = [
        ["Layer / Tool", "Purpose", "Coverage in window"],
        [
            "Financial Modeling Prep (FMP) Stable API",
            "Price / volume / fundamentals for the full US stock universe",
            f"{total_runs} daily runs, {total_api_calls:,} calls",
        ],
        [
            "Deterministic scorer (TypeScript, src/lib/scoring.ts)",
            "Rule-based weighted signals: MICROCAP_PRICE, SMALL_MARKET_CAP, "
            "MICRO_LIQUIDITY, SPIKE_7D, VOLUME_EXPLOSION, SPIKE_THEN_DROP, "
            "OVERBOUGHT_RSI, HIGH_VOLATILITY",
            "Applied to every evaluated stock",
        ],
        [
            "Statistical anomaly model (python_ai/anomaly_detection.py)",
            "Z-score, Keltner breakouts, ATR, surge detection",
            "Applied to flagged HIGH/MEDIUM cohort",
        ],
        [
            "Random Forest classifier (python_ai/ml_model.py)",
            "31-feature scam classifier (~95% accuracy on synthetic patterns)",
            "Applied to flagged HIGH/MEDIUM cohort",
        ],
        [
            "LSTM sequence model (python_ai/lstm_model.py)",
            "Temporal pump/dump signature detector on 30-day series",
            "Applied to flagged HIGH/MEDIUM cohort",
        ],
        [
            "OpenAI gpt-4o-mini (Phase 3 + classifier)",
            "News/SEC catalyst legitimacy and pump-pattern classification",
            "831 HIGH-risk stocks classified; 497 stocks pump-scored (Jan 24)",
        ],
        [
            "Reddit OAuth scanner",
            "r/wallstreetbets, r/pennystocks, r/shortsqueeze coverage",
            "Used in social-media batch (Jan 16-25)",
        ],
        [
            "StockTwits scanner",
            "Public API ticker stream + sentiment / message-volume spikes",
            "Used in social-media batch",
        ],
        [
            "YouTube Data API v3",
            "Influencer / promoter video discovery",
            "Used in social-media batch",
        ],
        [
            "Discord bot scanner",
            "Tracks 'Making Easy Money' and similar promo servers",
            "Used in social-media batch",
        ],
        [
            "Perplexity researcher + Serper (Google CSE)",
            "Open-web evidence gathering for confirmed pump groups",
            "Jan 25 promotion-evidence run",
        ],
    ]
    story.append(
        std_table(
            tools_rows,
            col_widths=[1.9 * inch, 2.8 * inch, 1.8 * inch],
        )
    )

    # Social-media scan effectiveness
    story.append(Paragraph("1.3 Social-media / AI follow-up scans", styles["H3Custom"]))
    sm_rows = [["Run", "Scope", "Output"]]
    if openai_class:
        sm_rows.append(
            [
                "OpenAI legitimacy classifier (2026-01-24)",
                f"{openai_class.get('totalClassified', 0):,} HIGH-risk stocks",
                f"{openai_class.get('legitimate', 0)} legitimate, "
                f"{openai_class.get('suspicious', 0)} suspicious, "
                f"{openai_class.get('unknown', 0)} unknown",
            ]
        )
    if pump_analysis:
        sm_rows.append(
            [
                "OpenAI pump-pattern classifier (2026-01-24)",
                f"{pump_analysis.get('totalAnalyzed', 0):,} stocks scored",
                f"{pump_analysis.get('highPump', 0)} HIGH_PUMP, "
                f"{pump_analysis.get('mediumPump', 0)} MEDIUM_PUMP, "
                f"{pump_analysis.get('lowPump', 0)} LOW_PUMP",
            ]
        )
    if promo:
        s = promo.get("summary", {})
        sm_rows.append(
            [
                "Web evidence sweep (2026-01-25)",
                f"{s.get('totalStocksSearched', 0)} stocks searched on Reddit / Twitter / "
                "StockTwits / Discord",
                f"{s.get('stocksWithEvidence', 0)} confirmed, "
                f"{s.get('stocksWithSuspectedActivity', 0)} suspected",
            ]
        )
    if comparison:
        comp = comparison.get("summary", {}).get("comparison", {})
        sm_rows.append(
            [
                "Cross-day comparison (Jan 15 vs Jan 16)",
                "Diff of 6,500+ evaluated stocks across two consecutive scans",
                f"{comp.get('persistentHighRisk', 0)} persistent HIGH, "
                f"{comp.get('newOnJan16', 0)} new, "
                f"{comp.get('resolvedFromJan15', 0)} resolved",
            ]
        )
    story.append(std_table(sm_rows, col_widths=[2.0 * inch, 2.5 * inch, 2.0 * inch]))

    story.append(PageBreak())

    # =======================================================================
    # SECTION 2 - FINDINGS
    # =======================================================================
    story.append(Paragraph("2. Findings", styles["H2Custom"]))

    # 2.1 Risk distribution per scan
    story.append(Paragraph("2.1 Risk distribution per scan", styles["H3Custom"]))
    risk_rows = [["Scan date", "HIGH", "MEDIUM", "LOW", "INSUFFICIENT", "Evaluated"]]
    for s in summaries:
        b = s.get("byRiskLevel", {})
        risk_rows.append(
            [
                s["_date"],
                f"{int(b.get('HIGH', 0)):,}",
                f"{int(b.get('MEDIUM', 0)):,}",
                f"{int(b.get('LOW', 0)):,}",
                f"{int(b.get('INSUFFICIENT', 0)):,}",
                f"{int(s.get('evaluated', 0)):,}",
            ]
        )
    story.append(
        std_table(
            risk_rows,
            col_widths=[1.0 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 1.0 * inch, 1.0 * inch],
        )
    )
    story.append(
        Paragraph(
            (
                "HIGH-risk volume swung between ~825 and ~1,454 stocks across the "
                "window. The Jan 15 and Jan 16 scans show the cohort stabilizing "
                "around ~830 HIGH-risk names after the AI classifier pass; Jan 17 "
                "re-expansion is driven by a fresh wave of micro-caps on NASDAQ "
                "(1,287 of 1,454 HIGH on NASDAQ alone)."
            ),
            styles["BodyCustom"],
        )
    )

    # 2.2 Signal frequency
    story.append(Paragraph("2.2 Signal frequency on HIGH-risk stocks (Jan 15-16)", styles["H3Custom"]))
    sig_rows = [["Signal", "Count", "% of HIGH"]]
    for sig, payload in (comparison.get("riskSignalFrequency") or {}).items():
        sig_rows.append([sig, f"{int(payload.get('count', 0)):,}", f"{payload.get('pct', 0)}%"])
    if len(sig_rows) > 1:
        story.append(std_table(sig_rows, col_widths=[2.4 * inch, 1.0 * inch, 1.0 * inch]))
    story.append(
        Paragraph(
            (
                "<b>Read:</b> volatility and micro-cap pricing dominate the HIGH-risk "
                "population, but the operationally interesting signals are "
                "SPIKE_7D (37%), SPIKE_THEN_DROP (35%) and VOLUME_EXPLOSION (11%) - "
                "these are the active manipulation indicators rather than baseline "
                "small-cap noise."
            ),
            styles["BodyCustom"],
        )
    )

    # 2.3 Top suspicious tickers
    story.append(Paragraph("2.3 Most suspicious tickers (persistent across the window)", styles["H3Custom"]))
    top = (comparison.get("mostSuspicious") or {}).get("stocks") or []
    top_rows = [["Symbol", "Name", "Exchange", "Sector", "Last", "Score (max)", "Both days?"]]
    for row in top[:12]:
        top_rows.append(
            [
                row.get("symbol", ""),
                Paragraph(f"<font size=7>{row.get('name', '')}</font>", styles["Cell"]),
                row.get("exchange", ""),
                row.get("sector", ""),
                f"${row.get('lastPrice', '')}",
                str(row.get("maxScore", "")),
                "Yes" if row.get("pumpAndDumpBothDates") else "No",
            ]
        )
    if len(top_rows) > 1:
        story.append(
            std_table(
                top_rows,
                col_widths=[
                    0.7 * inch,
                    1.7 * inch,
                    0.75 * inch,
                    1.1 * inch,
                    0.6 * inch,
                    0.85 * inch,
                    0.75 * inch,
                ],
            )
        )

    # 2.4 OpenAI legitimacy split
    story.append(Paragraph("2.4 AI legitimacy classification of HIGH-risk cohort", styles["H3Custom"]))
    if openai_class:
        total = openai_class.get("totalHighRisk", 0)
        legit = openai_class.get("legitimate", 0)
        susp = openai_class.get("suspicious", 0)
        unk = openai_class.get("unknown", 0)
        story.append(
            std_table(
                [
                    ["Bucket", "Count", "% of HIGH"],
                    ["Legitimate (real catalyst found)", f"{legit:,}", f"{legit / max(total,1) * 100:.1f}%"],
                    ["Suspicious (no catalyst, manipulation pattern)", f"{susp:,}", f"{susp / max(total,1) * 100:.1f}%"],
                    ["Unknown / unclassifiable", f"{unk:,}", f"{unk / max(total,1) * 100:.1f}%"],
                    ["Total", f"{total:,}", "100.0%"],
                ],
                col_widths=[3.4 * inch, 1.0 * inch, 1.2 * inch],
            )
        )
        story.append(
            Paragraph(
                (
                    "Roughly <b>64%</b> of HIGH-risk flags resolved to <i>suspicious</i> "
                    "after news / SEC filing review, while <b>35%</b> turned out to be "
                    "legitimate moves driven by earnings, FDA, M&amp;A or contract news. "
                    "This is the layer that suppresses false positives before alerts ship."
                ),
                styles["BodyCustom"],
            )
        )

    # 2.5 Confirmed pump groups / promoters
    story.append(Paragraph("2.5 Confirmed pump groups and promoters", styles["H3Custom"]))
    grp_rows = [["Group / promoter", "Members or activity", "Evidence"]]
    for grp in (promo.get("pumpGroupsIdentified") or []):
        grp_rows.append(
            [
                grp.get("name", ""),
                Paragraph(
                    f"<font size=7>{', '.join(grp.get('members', []))}</font>",
                    styles["Cell"],
                ),
                Paragraph(
                    f"<font size=7>{grp.get('evidence', '')}</font>",
                    styles["Cell"],
                ),
            ]
        )
    grp_rows.append(
        [
            "Grandmaster-Obi / Making Easy Money Discord (SCHEME-001)",
            Paragraph(
                "<font size=7>EVTV (+351%), VERO (+426%), SPHL (+1,057% then -70%), "
                "ANPA (+345%), MRNO, UAVS, INBS, GPUS, MNTS, LVRO, SIDU, DVLT</font>",
                styles["Cell"],
            ),
            Paragraph(
                "<font size=7>17,265-member Discord; pre-alert posts followed by "
                "coordinated price/volume spikes; multiple stocks now in dump phase</font>",
                styles["Cell"],
            ),
        ]
    )
    for promoter in (promo.get("promotersIdentified") or []):
        grp_rows.append(
            [
                promoter.get("name", ""),
                promoter.get("type", ""),
                Paragraph(
                    f"<font size=7>{promoter.get('evidence', '')}</font>",
                    styles["Cell"],
                ),
            ]
        )
    story.append(std_table(grp_rows, col_widths=[2.0 * inch, 2.3 * inch, 2.2 * inch]))

    # 2.6 Strong-evidence stocks
    story.append(Paragraph("2.6 Stocks with strong external promotion evidence", styles["H3Custom"]))
    ev_rows = [["Symbol", "Name", "Evidence", "Platforms"]]
    for stock in (promo.get("confirmedPromotionEvidence") or [])[:8]:
        ev_rows.append(
            [
                stock.get("symbol", ""),
                Paragraph(f"<font size=7>{stock.get('name', '')}</font>", styles["Cell"]),
                stock.get("evidence", ""),
                Paragraph(
                    f"<font size=7>{', '.join(stock.get('platforms', []))}</font>",
                    styles["Cell"],
                ),
            ]
        )
    story.append(
        std_table(
            ev_rows,
            col_widths=[0.7 * inch, 2.1 * inch, 0.9 * inch, 2.8 * inch],
        )
    )

    # 2.7 Detection validation block
    story.append(Paragraph("2.7 Detection validation (Jan 15-16 case study)", styles["H3Custom"]))
    val_rows = [
        ["Metric", "Result"],
        ["SCHEME-001 stocks detected", "2 / 2 (100%)"],
        ["Legitimate catalysts correctly identified", "19 / 30 manually reviewed (63%)"],
        ["Corporate-distress events identified", "4 / 30 (13%)"],
        ["Residual false-positive rate (uncertain bucket)", "~17% (5 stocks needed monitoring)"],
        ["New HIGH-risk entries during the 2-day diff", "147"],
        ["HIGH-risk stocks resolved during the same diff", "116"],
    ]
    story.append(std_table(val_rows, col_widths=[3.6 * inch, 2.6 * inch]))

    # 2.8 Active scheme records
    story.append(Paragraph("2.8 Active scheme records (as carried into Feb 2026)", styles["H3Custom"]))
    sch_rows = [
        ["Scheme ID", "Symbol", "Risk score", "Promotion score", "Status"],
        ["SCH-EVTV-20260202-9ALD", "EVTV", "16", "61", "ONGOING"],
        ["SCH-BCARW-20260202-88CA", "BCARW", "16", "58", "ONGOING"],
        ["SCH-SXTC-20260202-4CVF", "SXTC", "14", "61", "ONGOING"],
        ["SCH-JDZG-20260202-18AA", "JDZG", "14", "61", "ONGOING"],
    ]
    story.append(std_table(sch_rows, col_widths=[2.2 * inch, 0.8 * inch, 1.0 * inch, 1.2 * inch, 1.0 * inch]))

    # Closing summary
    story.append(Paragraph("3. Bottom line", styles["H2Custom"]))
    story.append(
        Paragraph(
            (
                f"Across the {total_runs} daily FMP runs in this window the system "
                f"evaluated <b>{total_evaluated:,}</b> stock-instances, made "
                f"<b>{total_api_calls:,}</b> external API calls, and finished an "
                f"average run in <b>{avg_dur} minutes</b>. The deterministic + AI "
                "stack converged on a working HIGH-risk cohort of roughly 830 names; "
                "after the OpenAI catalyst review, ~64% of those held up as truly "
                "suspicious. The two-week scan also produced concrete, actionable "
                "intelligence: one confirmed pump operation (Grandmaster-Obi / Making "
                "Easy Money Discord, 17k+ members), a recurring Chinese penny-stock "
                "coordination ring (OCG / TKAT / JFIN / ZKIN / YVR), a Reddit-driven "
                "DVLT short-squeeze episode, and a StockTwits-amplified MNTS frenzy "
                "(28,366% message-volume spike). Four schemes were carried forward "
                "for active tracking into the next window."
            ),
            styles["BodyCustom"],
        )
    )

    # ----- Render --------------------------------------------------------
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=LETTER,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title="ScamDunk 2-Week Scan Report",
        author="ScamDunk Pipeline",
    )
    doc.build(story)
    print(f"Wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    build()
