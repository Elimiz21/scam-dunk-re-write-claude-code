export function usagePercent(
  usage: { scansUsedThisMonth?: number } | null | undefined,
  monthlyCredits: number | null | undefined,
): number {
  if (!monthlyCredits || monthlyCredits <= 0) return 0;

  return Math.min(
    ((usage?.scansUsedThisMonth ?? 0) / monthlyCredits) * 100,
    100,
  );
}
