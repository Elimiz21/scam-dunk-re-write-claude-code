// NYSE full-day closures, verified 2026-09-17 against
// https://www.nyse.com/trade/hours-calendars (published 2026–2028 calendar).
// Half-days remain trading days. Unknown years fail closed and require refresh.
const HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);

function supported(date: Date): boolean {
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2026 && date.getUTCFullYear() <= 2028;
}

function tradingDay(date: Date): boolean {
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !HOLIDAYS.has(date.toISOString().slice(0, 10));
}

/** Session ending on/before an explicit EOD evaluation date; unknown calendars fail closed. */
export function marketSessionOnOrBefore(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const candidate = new Date(value + "T00:00:00Z");
  if (!supported(candidate) || candidate.toISOString().slice(0,10) !== value) return null;
  for (let offset = 0; offset < 8; offset++) {
    if (!supported(candidate)) return null;
    if (tradingDay(candidate)) return candidate.toISOString().slice(0,10);
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }
  return null;
}

/** Latest market session due for publication at the daily 07:00 UTC ingest. */
export function expectedMarketDate(now: Date): string | null {
  if (!supported(now)) return null;
  const candidate = new Date(now);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCDate(candidate.getUTCDate() - (now.getUTCHours() >= 7 ? 1 : 2));
  for (let offset = 0; offset < 8; offset++) {
    if (!supported(candidate)) return null;
    if (tradingDay(candidate)) return candidate.toISOString().slice(0, 10);
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }
  return null;
}

export function isCurrentMarketPublication(scanDate: Date, now: Date): boolean {
  const expected = expectedMarketDate(now);
  if (!expected || !supported(scanDate) || scanDate.getTime() > now.getTime() || !tradingDay(scanDate)) return false;
  return scanDate.toISOString().slice(0, 10) >= expected;
}

/** EOD data is due after 17:00 New York time, allowing one hour after a full close. */
export function expectedPriceSession(now: Date): string | null {
  if (!supported(now)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  const day = `${value("year")}-${value("month")}-${value("day")}`;
  const cutoff = new Date(day + "T00:00:00Z");
  if (Number(value("hour")) < 17) cutoff.setUTCDate(cutoff.getUTCDate()-1);
  return marketSessionOnOrBefore(cutoff.toISOString().slice(0,10));
}
