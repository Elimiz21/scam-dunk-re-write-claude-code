import { AIBackendResponse, parseAIBackendResponse } from "../../src/lib/ai-backend-schema";
import { MarketData } from "./standalone-scorer";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ProductionEvaluationRequest {
  ticker: string;
  asset_type: "stock";
  analysis_mode: "production_evaluation";
  use_live_data: false;
  days: number;
  sec_flagged: null;
  news_flag: false;
  historical_bars: MarketData["priceHistory"];
  fundamentals: {
    company_name: string | null;
    exchange: string | null;
    current_price: number | null;
    market_cap: number | null;
    avg_daily_volume: number | null;
    is_otc: boolean;
    on_watchlist: boolean;
  };
}

export interface PythonBackendPreflight {
  available: boolean;
  failure?: "configuration" | "health" | "authentication" | "malformed_response";
  detail?: string;
  scoringMode?: string;
  rfReady: boolean;
  lstmReady: boolean;
}

function validBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function buildProductionEvaluationRequest(
  symbol: string,
  marketData: MarketData,
  onWatchlist: boolean,
): ProductionEvaluationRequest {
  const quote = marketData.quote;
  return {
    ticker: symbol.trim().toUpperCase(),
    asset_type: "stock",
    analysis_mode: "production_evaluation",
    use_live_data: false,
    days: marketData.priceHistory.length,
    sec_flagged: null,
    news_flag: false,
    historical_bars: marketData.priceHistory.map((bar) => ({ ...bar })),
    fundamentals: {
      company_name: quote?.companyName ?? null,
      exchange: quote?.exchange ?? null,
      current_price: quote?.lastPrice ?? null,
      market_cap: quote?.marketCap ?? null,
      avg_daily_volume: quote?.avgVolume30d ?? null,
      is_otc: marketData.isOTC,
      on_watchlist: onWatchlist,
    },
  };
}

export async function preflightPythonAIBackend(options: {
  baseUrl: string;
  apiSecret: string;
  fetchImpl?: FetchLike;
}): Promise<PythonBackendPreflight> {
  const baseUrl = validBaseUrl(options.baseUrl);
  if (!baseUrl) {
    return {
      available: false,
      failure: "configuration",
      detail: "AI_BACKEND_URL must be an absolute HTTP(S) URL",
      rfReady: false,
      lstmReady: false,
    };
  }
  if (!options.apiSecret) {
    return {
      available: false,
      failure: "configuration",
      detail: "AI_API_SECRET is missing",
      rfReady: false,
      lstmReady: false,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const healthResponse = await fetchImpl(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!healthResponse.ok) {
      return {
        available: false,
        failure: "health",
        detail: `health returned HTTP ${healthResponse.status}`,
        rfReady: false,
        lstmReady: false,
      };
    }
    const health = (await healthResponse.json()) as Record<string, unknown>;
    if (health.status !== "healthy" || health.ready !== true) {
      return {
        available: false,
        failure: "health",
        detail: "engine is not ready",
        rfReady: false,
        lstmReady: false,
      };
    }

    const authResponse = await fetchImpl(`${baseUrl}/auth-check`, {
      headers: { "X-API-Key": options.apiSecret },
      signal: AbortSignal.timeout(5_000),
    });
    if (authResponse.status === 401 || authResponse.status === 403) {
      return {
        available: false,
        failure: "authentication",
        detail: `authenticated preflight returned HTTP ${authResponse.status}`,
        rfReady: false,
        lstmReady: false,
      };
    }
    if (!authResponse.ok) {
      return {
        available: false,
        failure: "health",
        detail: `authenticated preflight returned HTTP ${authResponse.status}`,
        rfReady: false,
        lstmReady: false,
      };
    }
    const auth = (await authResponse.json()) as Record<string, unknown>;
    if (auth.authenticated !== true) {
      return {
        available: false,
        failure: "malformed_response",
        detail: "authenticated preflight response was malformed",
        rfReady: false,
        lstmReady: false,
      };
    }
    return {
      available: true,
      scoringMode:
        typeof health.scoring_mode === "string" ? health.scoring_mode : undefined,
      rfReady: health.rf_ready === true,
      lstmReady: health.lstm_ready === true,
    };
  } catch (error) {
    return {
      available: false,
      failure: "health",
      detail: error instanceof Error ? error.message : String(error),
      rfReady: false,
      lstmReady: false,
    };
  }
}

export type PythonAnalysisResult =
  | { accepted: true; data: AIBackendResponse }
  | {
      accepted: false;
      failure:
        | "configuration"
        | "http_error"
        | "malformed_response"
        | "wrong_input_source"
        | "unavailable_data";
      detail?: string;
    };

export async function requestPythonAnalysis(options: {
  baseUrl: string;
  apiSecret: string;
  request: ProductionEvaluationRequest;
  fetchImpl?: FetchLike;
}): Promise<PythonAnalysisResult> {
  const baseUrl = validBaseUrl(options.baseUrl);
  if (!baseUrl || !options.apiSecret) {
    return { accepted: false, failure: "configuration" };
  }
  try {
    const response = await (options.fetchImpl ?? fetch)(`${baseUrl}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": options.apiSecret,
      },
      body: JSON.stringify(options.request),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return {
        accepted: false,
        failure: "http_error",
        detail: `HTTP ${response.status}`,
      };
    }
    const parsed = parseAIBackendResponse(await response.json());
    if (!parsed) return { accepted: false, failure: "malformed_response" };
    if (parsed.input_source !== "provided_real_bars") {
      return { accepted: false, failure: "wrong_input_source" };
    }
    if (!parsed.data_available) {
      return { accepted: false, failure: "unavailable_data" };
    }
    return { accepted: true, data: parsed };
  } catch (error) {
    return {
      accepted: false,
      failure: "http_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const LAYER_LABELS: Record<string, string> = {
  rule_signals: "Python rule signals",
  anomaly_detection: "Statistical anomaly detection",
  random_forest: "Random Forest",
  lstm: "LSTM",
};

export function acceptedLayerLabels(
  result: Pick<
    AIBackendResponse,
    "layers_applied" | "rf_probability" | "lstm_probability"
  >,
): string[] {
  return result.layers_applied
    .filter((layer) => {
      if (layer === "random_forest") return result.rf_probability != null;
      if (layer === "lstm") return result.lstm_probability != null;
      return true;
    })
    .map((layer) => LAYER_LABELS[layer]);
}
