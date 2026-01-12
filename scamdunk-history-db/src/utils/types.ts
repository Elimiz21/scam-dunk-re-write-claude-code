// Types for ScamDunk History Database

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT';

export interface Signal {
  code: string;
  category: 'STRUCTURAL' | 'PATTERN' | 'ALERT' | 'BEHAVIORAL';
  weight: number;
  description: string;
}

export interface EvaluationResult {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  industry?: string;
  marketCap: number | null;
  lastPrice: number | null;
  riskLevel: RiskLevel;
  totalScore: number;
  isLegitimate: boolean;
  isInsufficient?: boolean;
  signals: Signal[];
  signalSummary: string;
  evaluatedAt: string;
  priceDataSource: string;
  error?: string;
}

export interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  fmpSuccessCount?: number;
  byRiskLevel: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    INSUFFICIENT: number;
  };
  byExchange: Record<string, {
    total: number;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  }>;
  bySector?: Record<string, {
    total: number;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  }>;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  apiCallsMade?: number;
}

export interface SocialMediaEvidence {
  stockSymbol: string;
  promoterName: string;
  promoterHandle?: string;
  platform: string;
  groupName?: string;
  promotionDate?: string;
  promotionPrice?: number;
  evidenceLinks: string[];
  notes?: string;
  pumpAndDumpConfirmed?: boolean;
  matchesAtlasPattern?: boolean;
  missingDisclosures?: boolean;
}

export interface StockPriceData {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  previousClose?: number;
}

export interface RiskChangeReport {
  symbol: string;
  name: string;
  fromDate: string;
  toDate: string;
  fromRiskLevel: RiskLevel;
  toRiskLevel: RiskLevel;
  scoreChange: number;
  fromPrice: number | null;
  toPrice: number | null;
  priceChangePct: number | null;
  newSignals: string[];
  removedSignals: string[];
}

export interface DailyIngestionReport {
  scanDate: string;
  totalProcessed: number;
  newStocks: number;
  updatedSnapshots: number;
  errors: number;
  riskDistribution: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    INSUFFICIENT: number;
  };
  duration: number;
}

export interface TrendData {
  date: string;
  lowCount: number;
  mediumCount: number;
  highCount: number;
  totalEvaluated: number;
  avgScore: number;
}

export interface StockHistoryEntry {
  date: string;
  riskLevel: RiskLevel;
  totalScore: number;
  closePrice: number | null;
  volume: number | null;
  signals: string[];
}

export interface AlertType {
  NEW_HIGH_RISK: 'NEW_HIGH_RISK';
  RISK_INCREASED: 'RISK_INCREASED';
  RISK_DECREASED: 'RISK_DECREASED';
  PUMP_DETECTED: 'PUMP_DETECTED';
  DUMP_DETECTED: 'DUMP_DETECTED';
}

export const ALERT_TYPES = {
  NEW_HIGH_RISK: 'NEW_HIGH_RISK',
  RISK_INCREASED: 'RISK_INCREASED',
  RISK_DECREASED: 'RISK_DECREASED',
  PUMP_DETECTED: 'PUMP_DETECTED',
  DUMP_DETECTED: 'DUMP_DETECTED',
} as const;
