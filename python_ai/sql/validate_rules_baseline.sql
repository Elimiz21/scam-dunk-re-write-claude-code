-- How well do your CURRENT rules actually predict real crashes?
-- Run in the Supabase SQL Editor. Returns one row per riskLevel with the real
-- forward crash rate — the baseline any ML model must beat.
--
-- Definition of "crash": the close fell >= 40% within the next ~22 trading rows
-- (≈30 calendar days). Uses a forward window function (O(n)) rather than a
-- self-join, so it runs in seconds over ~680k rows.

WITH s AS (
  SELECT
    "riskLevel",
    "lastPrice" AS p,
    MIN("lastPrice") OVER (
      PARTITION BY "stockId" ORDER BY "scanDate"
      ROWS BETWEEN 1 FOLLOWING AND 22 FOLLOWING
    ) AS min_fwd,
    COUNT(*) OVER (
      PARTITION BY "stockId" ORDER BY "scanDate"
      ROWS BETWEEN 1 FOLLOWING AND 22 FOLLOWING
    ) AS fwd_pts
  FROM "StockDailySnapshot"
  WHERE "lastPrice" IS NOT NULL AND "lastPrice" > 0
)
SELECT
  "riskLevel",
  count(*)                                              AS observations,
  count(*) FILTER (WHERE min_fwd <= 0.6 * p)            AS crashed_next_30d,
  round(100.0 * count(*) FILTER (WHERE min_fwd <= 0.6 * p) / count(*), 1)
                                                        AS crash_rate_pct
FROM s
WHERE fwd_pts >= 10          -- only rows with a well-defined forward window
GROUP BY "riskLevel"
ORDER BY crash_rate_pct DESC;

-- Interpretation:
--   * If HIGH has a much higher crash_rate_pct than LOW, the rules carry real
--     signal (a good sign — and the bar to beat).
--   * If HIGH ≈ LOW, the rules aren't discriminating real outcomes and a
--     trained model has a lot of headroom.
--   * The overall crash rate (weighted across rows) is the class base rate the
--     Python trainer will report.
