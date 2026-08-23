export interface ParsedNewsLegitimacyResult {
  hasLegitimateNews: boolean;
  analysis: string;
}

export interface ParsedNewsAnalysisResponse {
  results: Map<string, ParsedNewsLegitimacyResult>;
  missingSymbols: string[];
}

function canonicalSymbol(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function parseNewsAnalysisResponse(
  expectedSymbols: string[],
  payload: unknown,
): ParsedNewsAnalysisResponse {
  const expected = expectedSymbols.map(canonicalSymbol);
  const expectedSet = new Set(expected);
  const rows = Array.isArray((payload as any)?.results)
    ? (payload as any).results
    : [];
  const results = new Map<string, ParsedNewsLegitimacyResult>();

  for (const row of rows) {
    const symbol = canonicalSymbol(row?.symbol);
    if (!expectedSet.has(symbol) || results.has(symbol)) {
      throw new Error(
        `OpenAI returned an unexpected or duplicate symbol: ${symbol || "empty"}`,
      );
    }
    results.set(symbol, {
      hasLegitimateNews: row?.hasLegitimateNews === true,
      analysis: `${row?.explanation || "Unable to analyze"}${
        row?.specificEvent ? ` Event: ${row.specificEvent}` : ""
      }`,
    });
  }

  return {
    results,
    missingSymbols: expected.filter((symbol) => !results.has(symbol)),
  };
}
