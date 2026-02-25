/**
 * Enhanced Daily Scanning Pipeline
 * 
 * This is the main orchestrator for the comprehensive daily stock scan.
 * 
 * Pipeline Steps:
 * 1. Run all 4 AI scans on US stocks (structural, pattern, anomaly, ML prediction)
 * 2. Aggregate risk scores for each stock
 * 3. Filter high-risk stocks by removing large cap / high volume stocks
 * 4. Filter out stocks with legitimate news reasons (SEC filings, press releases)
 * 5. For remaining suspicious stocks, scan social media for promotion patterns
 * 6. Track and number potential schemes for ongoing monitoring
 * 7. Store results in daily database
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import * as fs from 'fs';
import { execSync } from 'child_process';

// Import scoring modules
import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';
import { ComprehensiveScanResult, PlatformScanResult as RealPlatformScanResult } from './real-social-scanner';
import { runSocialScan } from './social-scan/index';
import { ScanTarget, TickerScanResult } from './social-scan/types';


const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SCHEME_DB_DIR = path.join(__dirname, '..', 'scheme-database');

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(SCHEME_DB_DIR)) fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || '';  // Python AI backend for full 4-layer analysis
const AI_API_SECRET = process.env.AI_API_SECRET || '';  // Auth key for Python AI backend
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
// Note: Legacy v3 endpoints deprecated Aug 31, 2025 - now using stable API
const FMP_DELAY_MS = 210;

// Thresholds for filtering
const MARKET_CAP_THRESHOLD = 10_000_000_000; // $10B - excludes mega/large cap
const VOLUME_THRESHOLD = 10_000_000; // $10M daily volume - excludes highly liquid stocks
const TOP_N_MARKET_CAP_EXCLUDE = 100; // Exclude top 100 by market cap

// AI Layer configuration flags
const USE_PYTHON_AI = !!AI_BACKEND_URL;  // Use full 4-layer AI if backend is available

// Types
interface EnhancedStockResult {
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    industry: string;
    marketCap: number | null;
    lastPrice: number | null;
    avgDailyVolume: number | null;
    avgDollarVolume: number | null;

    // Risk scoring
    riskLevel: string;
    totalScore: number;
    signals: Array<{
        code: string;
        category: string;
        weight: number;
        description: string;
    }>;

    // AI Layer outputs (from Python AI backend - all 4 layers)
    aiLayers: {
        layer1_deterministic: number | null;  // TypeScript standalone-scorer
        layer2_anomaly: number | null;        // Statistical anomaly detection
        layer3_rf: number | null;             // Random Forest ML
        layer4_lstm: number | null;           // LSTM deep learning
        combined: number | null;              // Ensemble combined probability
        usedPythonBackend: boolean;           // Whether Python AI was used
    };

    // Filtering status
    isFiltered: boolean;
    filterReason: string | null;

    // News analysis
    hasLegitimateNews: boolean;
    newsAnalysis: string | null;
    recentNews: Array<{
        title: string;
        date: string;
        source: string;
        url: string;
    }>;
    secFilings: Array<{
        type: string;
        date: string;
        url: string;
    }>;

    // Social media scan (only for remaining high-risk stocks)
    socialMediaScanned: boolean;
    socialMediaFindings?: ComprehensiveScanResult | null;

    // Scheme tracking
    schemeId: string | null;
    schemeStatus: 'NEW' | 'ONGOING' | 'RESOLVED' | null;

    evaluatedAt: string;
}

interface DailyReport {
    date: string;
    totalStocksScanned: number;
    byRiskLevel: {
        LOW: number;
        MEDIUM: number;
        HIGH: number;
        INSUFFICIENT: number;
    };
    highRiskBeforeFilters: number;
    filteredByMarketCap: number;
    filteredByVolume: number;
    filteredByNews: number;
    remainingSuspicious: number;
    activeSchemes: number;
    newSchemes: number;
    processingTimeMinutes: number;
}

interface SchemeRecord {
    schemeId: string;
    symbol: string;
    name: string;
    sector?: string;
    industry?: string;
    firstDetected: string;
    lastSeen: string;
    daysActive?: number;
    // Status flow: NEW → ONGOING → COOLING → (PUMP_AND_DUMP_ENDED | PUMP_AND_DUMP_ENDED_NO_PROMO | NO_SCAM_DETECTED)
    // CONFIRMED_FRAUD is for manually verified cases
    status:
    | 'NEW'                          // Just detected, day 1
    | 'ONGOING'                       // Active for 2+ days
    | 'COOLING'                       // Price dropping from peak (dump phase)
    | 'PUMP_AND_DUMP_ENDED'           // Full cycle detected WITH social media promotion
    | 'PUMP_AND_DUMP_ENDED_NO_PROMO'  // Full cycle detected WITHOUT social media proof
    | 'NO_SCAM_DETECTED'              // Went inactive without showing full P&D pattern
    | 'CONFIRMED_FRAUD';              // Manually verified as fraud
    peakRiskScore: number;
    currentRiskScore: number;
    peakPromotionScore?: number;
    currentPromotionScore?: number;
    promotionPlatforms: string[];
    promoterAccounts: Array<{
        platform: string;
        identifier: string;
        firstSeen: string;
        lastSeen: string;
        postCount: number;
        confidence: 'high' | 'medium' | 'low';
    }>;
    hadSocialMediaPromotion: boolean;     // Whether we found real social media promotion
    priceAtDetection: number;
    peakPrice: number;
    currentPrice: number;
    priceChangeFromDetection?: number;
    priceChangeFromPeak?: number;
    volumeAtDetection: number;
    peakVolume?: number;
    currentVolume?: number;
    signalsDetected?: string[];
    coordinationIndicators?: string[];
    notes: string[];
    investigationFlags?: string[];
    resolutionDetails?: string;
    timeline: Array<{
        date: string;
        event: string;
        details: string;
        category?: 'detection' | 'price_movement' | 'promotion' | 'volume' | 'status_change' | 'note';
        significance?: 'high' | 'medium' | 'low';
    }>;
}

// Utility functions
function curlFetch(url: string): string | null {
    try {
        const result = execSync(
            `curl -s --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`,
            { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
        return result;
    } catch {
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getEvaluationDate(): string {
    return process.env.EVALUATION_DATE || new Date().toISOString().split('T')[0];
}

// Load stock list
function loadStockList(): any[] {
    const stockListPath = path.join(DATA_DIR, 'us-stocks.json');
    if (!fs.existsSync(stockListPath)) {
        console.error('Stock list not found. Please run fetch-us-stocks.ts first.');
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(stockListPath, 'utf-8'));
}

// Load existing scheme database
// Uses scheme-database.json (shared with scheme-tracker.ts) for unified tracking
function loadSchemeDatabase(): Map<string, SchemeRecord> {
    const dbPath = path.join(SCHEME_DB_DIR, 'scheme-database.json');
    if (!fs.existsSync(dbPath)) {
        return new Map();
    }
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        // scheme-database.json uses a wrapper format with a 'schemes' property
        const schemes = data.schemes || data;
        return new Map(Object.entries(schemes));
    } catch {
        return new Map();
    }
}

// Save scheme database
// Writes in the SchemeDatabase wrapper format shared with scheme-tracker.ts
// Also generates the promoter database from aggregated promoter data
function saveSchemeDatabase(db: Map<string, SchemeRecord>): void {
    const dbPath = path.join(SCHEME_DB_DIR, 'scheme-database.json');
    const schemes = Object.fromEntries(db);
    const schemeValues = Object.values(schemes);
    const activeStatuses = ['NEW', 'ONGOING', 'COOLING'];
    const resolvedStatuses = ['PUMP_AND_DUMP_ENDED', 'PUMP_AND_DUMP_ENDED_NO_PROMO', 'NO_SCAM_DETECTED', 'RESOLVED'];

    const wrappedData = {
        lastUpdated: new Date().toISOString(),
        totalSchemes: schemeValues.length,
        activeSchemes: schemeValues.filter(s => activeStatuses.includes(s.status)).length,
        resolvedSchemes: schemeValues.filter(s => resolvedStatuses.includes(s.status)).length,
        confirmedFrauds: schemeValues.filter(s => s.status === 'CONFIRMED_FRAUD').length,
        schemes
    };

    fs.writeFileSync(dbPath, JSON.stringify(wrappedData, null, 2));

    // Generate promoter database
    generatePromoterDatabase(schemeValues);
}

// Build the promoter matrix database from all scheme data
function generatePromoterDatabase(schemes: SchemeRecord[]): void {
    const promoterDbPath = path.join(SCHEME_DB_DIR, 'promoter-database.json');

    interface PromoterEntry {
        promoterId: string;
        identifier: string;
        platform: string;
        firstSeen: string;
        lastSeen: string;
        totalPosts: number;
        confidence: string;
        stocksPromoted: Array<{
            symbol: string;
            schemeId: string;
            schemeName: string;
            schemeStatus: string;
            firstSeen: string;
            lastSeen: string;
            postCount: number;
        }>;
        coPromoters: Array<{
            promoterId: string;
            identifier: string;
            platform: string;
            sharedStocks: string[];
        }>;
        riskLevel: string;
        isActive: boolean;
    }

    const promoterMap = new Map<string, PromoterEntry>();

    // Aggregate promoter data across all schemes
    for (const scheme of schemes) {
        if (!Array.isArray(scheme.promoterAccounts)) continue;

        for (const account of scheme.promoterAccounts) {
            // Skip string-formatted legacy entries
            if (typeof account === 'string') continue;

            const key = `${account.platform}::${account.identifier}`;
            let promoter = promoterMap.get(key);

            if (!promoter) {
                promoter = {
                    promoterId: `PROM-${account.platform.replace(/[^a-zA-Z]/g, '').toUpperCase()}-${account.identifier.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
                    identifier: account.identifier,
                    platform: account.platform,
                    firstSeen: account.firstSeen,
                    lastSeen: account.lastSeen,
                    totalPosts: 0,
                    confidence: account.confidence,
                    stocksPromoted: [],
                    coPromoters: [],
                    riskLevel: 'LOW',
                    isActive: false,
                };
                promoterMap.set(key, promoter);
            }

            // Update aggregate fields
            promoter.totalPosts += account.postCount;
            if (account.firstSeen < promoter.firstSeen) promoter.firstSeen = account.firstSeen;
            if (account.lastSeen > promoter.lastSeen) promoter.lastSeen = account.lastSeen;
            if (account.confidence === 'high') promoter.confidence = 'high';

            // Check if this stock is already tracked
            const existing = promoter.stocksPromoted.find(s => s.schemeId === scheme.schemeId);
            if (!existing) {
                promoter.stocksPromoted.push({
                    symbol: scheme.symbol,
                    schemeId: scheme.schemeId,
                    schemeName: scheme.name,
                    schemeStatus: scheme.status,
                    firstSeen: account.firstSeen,
                    lastSeen: account.lastSeen,
                    postCount: account.postCount,
                });
            }

            // Active if any associated scheme is active
            const activeStatuses = ['NEW', 'ONGOING', 'COOLING'];
            if (activeStatuses.includes(scheme.status)) {
                promoter.isActive = true;
            }
        }
    }

    // Build co-promoter relationships
    const promoterList = Array.from(promoterMap.values());
    for (const promoter of promoterList) {
        const myStocks = new Set(promoter.stocksPromoted.map(s => s.symbol));

        for (const other of promoterList) {
            if (other.promoterId === promoter.promoterId) continue;
            const sharedStocks = other.stocksPromoted
                .filter(s => myStocks.has(s.symbol))
                .map(s => s.symbol);

            if (sharedStocks.length > 0) {
                promoter.coPromoters.push({
                    promoterId: other.promoterId,
                    identifier: other.identifier,
                    platform: other.platform,
                    sharedStocks,
                });
            }
        }

        // Calculate risk level
        const stockCount = promoter.stocksPromoted.length;
        const hasHighConfidence = promoter.confidence === 'high';
        const hasCoPromoters = promoter.coPromoters.length > 0;

        if (stockCount >= 3 || (stockCount >= 2 && hasHighConfidence && hasCoPromoters)) {
            promoter.riskLevel = 'SERIAL_OFFENDER';
        } else if (stockCount >= 2 || (hasHighConfidence && hasCoPromoters)) {
            promoter.riskLevel = 'HIGH';
        } else if (hasHighConfidence || hasCoPromoters) {
            promoter.riskLevel = 'MEDIUM';
        } else {
            promoter.riskLevel = 'LOW';
        }
    }

    const promoterDb = {
        lastUpdated: new Date().toISOString(),
        totalPromoters: promoterList.length,
        activePromoters: promoterList.filter(p => p.isActive).length,
        serialOffenders: promoterList.filter(p => p.riskLevel === 'SERIAL_OFFENDER').length,
        promoters: Object.fromEntries(
            promoterList.map(p => [p.promoterId, p])
        ),
    };

    fs.writeFileSync(promoterDbPath, JSON.stringify(promoterDb, null, 2));
    console.log(`  Promoter database: ${promoterList.length} promoters tracked`);
}

// Generate unique scheme ID
function generateSchemeId(symbol: string, date: string): string {
    const timestamp = Date.now().toString(36);
    return `SCHEME-${symbol}-${date.replace(/-/g, '')}-${timestamp}`.toUpperCase();
}

// Python AI Backend Integration - Calls all 4 AI Layers
// Layer 1: Deterministic Signal Detection (rule-based)
// Layer 2: Statistical Anomaly Detection (Z-scores, Keltner, ATR)
// Layer 3: Machine Learning Classification (Random Forest)
// Layer 4: Deep Learning Sequence Analysis (LSTM)
interface PythonAIResult {
    success: boolean;
    riskLevel: string;
    riskProbability: number;
    rf_probability: number | null;         // Layer 3: Random Forest
    lstm_probability: number | null;       // Layer 4: LSTM
    anomaly_score: number;                  // Layer 2: Anomaly Detection
    signals: Array<{
        code: string;
        category: string;
        weight: number;
        description: string;
    }>;
    sec_flagged: boolean;
    is_otc: boolean;
    is_micro_cap: boolean;
    stock_info?: {
        company_name?: string;
        exchange?: string;
        last_price?: number;
        market_cap?: number;
        avg_volume?: number;
    };
    error?: string;
}

async function callPythonAIBackend(symbol: string): Promise<PythonAIResult | null> {
    if (!AI_BACKEND_URL) {
        return null;
    }

    try {
        // Build auth header if API secret is configured
        const authHeader = AI_API_SECRET
            ? `-H "X-API-Key: ${AI_API_SECRET}" `
            : '';

        // Use -w to append HTTP status code, separated by newline
        const cmd = `curl -s --max-time 30 -w '\\n%{http_code}' -X POST "${AI_BACKEND_URL}/analyze" ` +
            `-H "Content-Type: application/json" ` +
            authHeader +
            `-d '{"ticker": "${symbol}", "asset_type": "stock", "use_live_data": true}'`;

        const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

        if (!result) return null;

        // Parse HTTP status code from the last line
        const lines = result.trim().split('\n');
        const httpStatus = parseInt(lines[lines.length - 1], 10);
        const body = lines.slice(0, -1).join('\n');

        // Reject non-200 responses instead of silently treating them as LOW
        if (httpStatus !== 200) {
            console.log(`     Python AI backend returned HTTP ${httpStatus} for ${symbol}`);
            return null;
        }

        if (!body) return null;

        const data = JSON.parse(body);

        // Validate that the response has the expected structure
        // (prevents error responses like {"detail":"..."} from being misinterpreted)
        if (!data.ticker && !data.risk_level) {
            console.log(`     Python AI backend returned unexpected response for ${symbol}`);
            return null;
        }

        return {
            success: true,
            riskLevel: data.risk_level || 'LOW',
            riskProbability: data.risk_probability || 0,
            rf_probability: data.rf_probability || null,
            lstm_probability: data.lstm_probability || null,
            anomaly_score: data.anomaly_score || 0,
            signals: data.signals || [],
            sec_flagged: data.sec_flagged || false,
            is_otc: data.is_otc || false,
            is_micro_cap: data.is_micro_cap || false,
            stock_info: data.stock_info
        };
    } catch (error: any) {
        // Python backend not available or error
        return null;
    }
}

// Check if Python AI Backend is available
async function checkPythonAIHealth(): Promise<boolean> {
    if (!AI_BACKEND_URL) return false;

    try {
        const result = curlFetch(`${AI_BACKEND_URL}/health`);
        if (!result) return false;
        const data = JSON.parse(result);
        return data.status === 'healthy';
    } catch {
        return false;
    }
}

// FMP API functions
interface ExtendedQuote extends StockQuote {
    sector?: string;
    industry?: string;
}

function fetchFMPQuote(symbol: string): ExtendedQuote | null {
    const url = `${FMP_BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    const response = curlFetch(url);
    if (!response) return null;

    try {
        const data = JSON.parse(response);
        if (!data || data.length === 0 || data['Error Message']) return null;
        const profile = data[0];
        return {
            ticker: symbol.toUpperCase(),
            companyName: profile.companyName || symbol,
            exchange: profile.exchange || 'Unknown',
            lastPrice: profile.price || 0,
            marketCap: profile.marketCap || 0,
            avgVolume30d: profile.averageVolume || profile.volume || 0,
            avgDollarVolume30d: (profile.averageVolume || profile.volume || 0) * (profile.price || 0),
            sector: profile.sector || 'Unknown',
            industry: profile.industry || 'Unknown',
        };
    } catch {
        return null;
    }
}

function fetchFMPHistory(symbol: string): PriceHistory[] {
    const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
    const response = curlFetch(url);
    if (!response) return [];

    try {
        const data = JSON.parse(response);
        if (!data || data.length === 0 || data['Error Message']) return [];
        return data
            .slice(0, 100)
            .reverse()
            .map((day: any) => ({
                date: day.date,
                open: day.open,
                high: day.high,
                low: day.low,
                close: day.close,
                volume: day.volume,
            }));
    } catch {
        return [];
    }
}

async function fetchStockData(symbol: string): Promise<MarketData | null> {
    const quote = fetchFMPQuote(symbol);
    if (!quote) return null;
    await sleep(FMP_DELAY_MS);

    const priceHistory = fetchFMPHistory(symbol);
    const otcExchanges = ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'OTC Markets'];
    const isOTC = otcExchanges.some(exc =>
        quote.exchange.toUpperCase().includes(exc.toUpperCase())
    );

    return {
        quote,
        priceHistory,
        isOTC,
        dataAvailable: priceHistory.length > 0,
    };
}

// Fetch stock news
async function fetchStockNews(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        // Using stable API (v3 deprecated Aug 31, 2025)
        const url = `${FMP_BASE_URL}/news/stock?symbols=${symbol}&limit=15&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const news = JSON.parse(response);
        // FMP API can return error objects like {"Error Message": "..."} - ensure we always return an array
        return Array.isArray(news) ? news : [];
    } catch {
        return [];
    }
}

// Fetch SEC filings
async function fetchSECFilings(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        // Using stable API (v3 deprecated Aug 31, 2025)
        // Get filings from last 90 days
        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const url = `${FMP_BASE_URL}/sec-filings-search/symbol?symbol=${symbol}&from=${fromDate}&to=${toDate}&limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const filings = JSON.parse(response);
        // FMP API can return error objects - ensure we always return an array
        return Array.isArray(filings) ? filings : [];
    } catch {
        return [];
    }
}

// Fetch press releases
async function fetchPressReleases(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        // Using stable API (v3 deprecated Aug 31, 2025)
        const url = `${FMP_BASE_URL}/news/press-releases?symbols=${symbol}&limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const releases = JSON.parse(response);
        // FMP API can return error objects - ensure we always return an array
        return Array.isArray(releases) ? releases : [];
    } catch {
        return [];
    }
}

// Check if stock should be filtered by size/volume
function shouldFilterBySize(quote: ExtendedQuote | null): { filtered: boolean; reason: string | null } {
    if (!quote) return { filtered: false, reason: null };

    if (quote.marketCap > MARKET_CAP_THRESHOLD) {
        return {
            filtered: true,
            reason: `Large market cap ($${(quote.marketCap / 1_000_000_000).toFixed(1)}B) - not susceptible to pump-and-dump`
        };
    }

    if (quote.avgDollarVolume30d > VOLUME_THRESHOLD) {
        return {
            filtered: true,
            reason: `High daily volume ($${(quote.avgDollarVolume30d / 1_000_000).toFixed(1)}M) - highly liquid, hard to manipulate`
        };
    }

    return { filtered: false, reason: null };
}

// Analyze news legitimacy using OpenAI
async function analyzeNewsLegitimacy(
    symbol: string,
    name: string,
    signals: any[],
    news: any[],
    secFilings: any[],
    pressReleases: any[]
): Promise<{ hasLegitimateNews: boolean; analysis: string }> {
    if (!OPENAI_API_KEY) {
        return { hasLegitimateNews: false, analysis: 'OpenAI API key not configured' };
    }

    // Ensure all inputs are arrays (defensive check)
    const safeNews = Array.isArray(news) ? news : [];
    const safeFilings = Array.isArray(secFilings) ? secFilings : [];
    const safeReleases = Array.isArray(pressReleases) ? pressReleases : [];
    const safeSignals = Array.isArray(signals) ? signals : [];

    // If no news or filings, quick return
    if (safeNews.length === 0 && safeFilings.length === 0 && safeReleases.length === 0) {
        return { hasLegitimateNews: false, analysis: 'No recent news, SEC filings, or press releases found.' };
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const newsText = safeNews.slice(0, 5).map((n: any) =>
        `[${n?.publishedDate || 'N/A'}] ${n?.title || 'N/A'}: ${n?.text?.substring(0, 200) || ''}...`
    ).join('\n\n');

    const filingsText = safeFilings.slice(0, 5).map((f: any) =>
        `[${f?.fillingDate || f?.date || 'N/A'}] ${f?.type || 'N/A'}: ${f?.link || 'N/A'}`
    ).join('\n');

    const releasesText = safeReleases.slice(0, 3).map((p: any) =>
        `[${p?.date || 'N/A'}] ${p?.title || 'N/A'}`
    ).join('\n');

    const signalsText = safeSignals.map(s => s?.description || '').join('; ');

    const prompt = `Analyze whether the following news, SEC filings, and press releases provide a LEGITIMATE explanation for unusual trading activity in ${symbol} (${name}).

STOCK SIGNALS DETECTED:
${signalsText}

RECENT NEWS:
${newsText || 'No recent news'}

SEC FILINGS:
${filingsText || 'No recent SEC filings'}

PRESS RELEASES:
${releasesText || 'No recent press releases'}

LEGITIMATE EXPLANATIONS (filter out these stocks):
- Earnings announcements (positive, negative, or guidance)
- FDA approvals, clinical trial results, drug applications
- Major contract wins, partnerships, or customer announcements
- Merger/acquisition news (announced or rumored)
- Significant regulatory approvals or licenses
- Major product launches or new services
- Management changes (CEO, CFO appointments)
- Stock splits, reverse splits, or share buybacks
- Significant legal settlements or resolutions
- Major financing or capital raises

NOT LEGITIMATE (still suspicious):
- Vague "investor awareness" campaigns
- Paid promotional articles or "sponsored content"
- Press releases with no substantive news
- Articles from known stock promotion sites
- Generic positive sentiment with no actual news
- Unverified claims or "sources say" articles

Respond in JSON format:
{
  "hasLegitimateNews": true/false,
  "legitimateNewsType": "earnings/fda/merger/contract/regulatory/product/management/stock_action/legal/financing/none",
  "explanation": "Brief explanation of your reasoning",
  "confidence": "high/medium/low",
  "specificEvent": "The specific event that explains the activity, or null"
}`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 500
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');
        return {
            hasLegitimateNews: result.hasLegitimateNews === true,
            analysis: `${result.explanation || 'Unable to analyze'}${result.specificEvent ? ` Event: ${result.specificEvent}` : ''}`
        };
    } catch (error: any) {
        console.log(`  Error analyzing news for ${symbol}:`, error?.message || error);
        return { hasLegitimateNews: false, analysis: 'Error during analysis' };
    }
}



// Convert modular TickerScanResult → ComprehensiveScanResult (used by scheme tracker)
function tickerResultToComprehensiveScan(result: TickerScanResult): ComprehensiveScanResult {
    return {
        symbol: result.ticker,
        name: result.name,
        scanDate: result.scanDate,
        platforms: result.platforms.map(p => ({
            platform: p.platform,
            success: p.success,
            dataSource: 'real' as const,
            mentionsFound: p.mentionsFound,
            mentions: p.mentions.map(m => ({
                platform: m.platform as any,
                source: m.source,
                title: m.title,
                content: m.content,
                url: m.url,
                author: m.author,
                date: m.postDate,
                engagement: m.engagement,
                sentiment: m.sentiment,
                isPromotional: m.isPromotional,
                promotionScore: m.promotionScore,
                redFlags: m.redFlags,
            })),
            overallActivityLevel: p.activityLevel,
            promotionRisk: p.promotionRisk,
            error: p.error,
        })),
        overallPromotionScore: result.overallPromotionScore,
        riskLevel: result.riskLevel,
        hasRealSocialEvidence: result.hasRealEvidence,
        potentialPromoters: result.topPromoters.map(tp => ({
            platform: tp.platform,
            username: tp.username,
            postCount: tp.postCount,
            confidence: (tp.avgPromotionScore >= 60 ? 'high'
                : tp.avgPromotionScore >= 30 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        })),
        summary: result.summary,
    };
}

// ─── Scan Status Tracking ───────────────────────────────────────────
// Captures phase-level completion, timing, and errors so the admin
// dashboard can show exactly what ran (and what didn't).

interface PhaseStatus {
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    error: string | null;
    details: Record<string, any>;
}

interface ScanStatus {
    date: string;
    pipelineStatus: 'running' | 'completed' | 'failed';
    startedAt: string;
    completedAt: string | null;
    durationMinutes: number | null;
    error: string | null;
    failedAtPhase: string | null;
    aiBackend: {
        configured: boolean;
        available: boolean;
        layersUsed: string[];
    };
    phases: {
        phase1_riskScoring: PhaseStatus;
        phase2_sizeFiltering: PhaseStatus;
        phase3_newsAnalysis: PhaseStatus;
        phase4_socialMedia: PhaseStatus;
        phase5_schemeTracking: PhaseStatus;
    };
    summary: {
        totalStocks: number;
        processed: number;
        skippedNoData: number;
        riskCounts: { LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number };
        highRiskBeforeFilters: number;
        filteredByMarketCap: number;
        filteredByVolume: number;
        filteredByNews: number;
        remainingSuspicious: number;
        newSchemes: number;
        ongoingSchemes: number;
        totalActiveSchemes: number;
    };
    socialMediaDetails: {
        platformsUsed: string[];
        platformResults: Array<{
            platform: string;
            scanner: string;
            configured: boolean;
            success: boolean;
            mentionsFound: number;
            error: string | null;
        }>;
        totalMentions: number;
        tickersScanned: number;
        tickersWithMentions: number;
    };
}

function createInitialScanStatus(date: string): ScanStatus {
    const emptyPhase = (name: string): PhaseStatus => ({
        name,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        details: {},
    });
    return {
        date,
        pipelineStatus: 'running',
        startedAt: new Date().toISOString(),
        completedAt: null,
        durationMinutes: null,
        error: null,
        failedAtPhase: null,
        aiBackend: { configured: false, available: false, layersUsed: [] },
        phases: {
            phase1_riskScoring: emptyPhase('Risk Scoring All Stocks'),
            phase2_sizeFiltering: emptyPhase('Size & Volume Filtering'),
            phase3_newsAnalysis: emptyPhase('News & SEC Filing Analysis'),
            phase4_socialMedia: emptyPhase('Social Media Scanning'),
            phase5_schemeTracking: emptyPhase('Scheme Tracking & Numbering'),
        },
        summary: {
            totalStocks: 0, processed: 0, skippedNoData: 0,
            riskCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 },
            highRiskBeforeFilters: 0, filteredByMarketCap: 0,
            filteredByVolume: 0, filteredByNews: 0,
            remainingSuspicious: 0, newSchemes: 0, ongoingSchemes: 0,
            totalActiveSchemes: 0,
        },
        socialMediaDetails: {
            platformsUsed: [], platformResults: [],
            totalMentions: 0, tickersScanned: 0, tickersWithMentions: 0,
        },
    };
}

function saveScanStatus(scanStatus: ScanStatus): void {
    const statusPath = path.join(RESULTS_DIR, `scan-status-${scanStatus.date}.json`);
    fs.writeFileSync(statusPath, JSON.stringify(scanStatus, null, 2));
}

function sendCrashNotification(scanStatus: ScanStatus): void {
    const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
    if (!RESEND_API_KEY) {
        console.log('RESEND_API_KEY not set – skipping crash email');
        return;
    }

    const completedPhases = Object.values(scanStatus.phases)
        .filter(p => p.status === 'completed')
        .map(p => p.name);
    const failedPhase = Object.values(scanStatus.phases)
        .find(p => p.status === 'failed');

    const phasesHtml = Object.values(scanStatus.phases).map(p => {
        const icon = p.status === 'completed' ? '&#9989;' // green check
            : p.status === 'failed' ? '&#10060;'          // red X
            : p.status === 'running' ? '&#9203;'          // hourglass
            : '&#9898;';                                   // white circle
        const color = p.status === 'completed' ? '#16a34a'
            : p.status === 'failed' ? '#dc2626'
            : '#9ca3af';
        return `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${icon}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:${color};font-weight:600;">${p.status.toUpperCase()}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${p.name}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:#666;">${p.error || ''}</td></tr>`;
    }).join('');

    const body = JSON.stringify({
        from: 'ScamDunk Alerts <noreply@scamdunk.com>',
        to: ['elimizroch@gmail.com'],
        subject: `[CRASH] Daily Scan FAILED – ${scanStatus.date}${failedPhase ? ` (${failedPhase.name})` : ''}`,
        html: `<h2 style="color:#dc2626;">Daily Scan Pipeline Crashed</h2>
<p><strong>Date:</strong> ${scanStatus.date}<br/><strong>Failed at:</strong> ${failedPhase?.name || 'Unknown'}<br/><strong>Error:</strong> <code>${scanStatus.error || 'Unknown error'}</code></p>
<h3>Phase Status</h3>
<table style="border-collapse:collapse;width:100%;font-size:14px;"><thead><tr style="background:#f9fafb;"><th style="padding:6px 12px;text-align:left;"></th><th style="padding:6px 12px;text-align:left;">Status</th><th style="padding:6px 12px;text-align:left;">Phase</th><th style="padding:6px 12px;text-align:left;">Error</th></tr></thead><tbody>${phasesHtml}</tbody></table>
<p style="margin-top:20px;"><strong>Completed before crash:</strong> ${completedPhases.length > 0 ? completedPhases.join(', ') : 'None'}</p>
<p style="color:#666;font-size:12px;margin-top:30px;">This alert was sent by the ScamDunk automated pipeline.</p>`,
    });

    try {
        execSync(
            `curl -s -X POST "https://api.resend.com/emails" -H "Authorization: Bearer ${RESEND_API_KEY}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`,
            { encoding: 'utf-8', timeout: 15000 }
        );
        console.log('Crash notification email sent to elimizroch@gmail.com');
    } catch (emailErr: any) {
        console.error('Failed to send crash notification:', emailErr?.message || emailErr);
    }
}

// Main pipeline execution
async function runEnhancedPipeline(): Promise<void> {
    const startTime = Date.now();
    const evaluationDate = getEvaluationDate();
    const scanStatus = createInitialScanStatus(evaluationDate);

    console.log('='.repeat(80));
    console.log('ENHANCED DAILY SCANNING PIPELINE');
    console.log(`Date: ${evaluationDate}`);
    console.log('='.repeat(80));

    // Validate API keys
    if (!FMP_API_KEY) {
        console.error('ERROR: FMP_API_KEY not set');
        scanStatus.pipelineStatus = 'failed';
        scanStatus.error = 'FMP_API_KEY not set';
        saveScanStatus(scanStatus);
        sendCrashNotification(scanStatus);
        process.exit(1);
    }

    // Load stocks
    const stocks = loadStockList();
    console.log(`\nLoaded ${stocks.length} US stocks for scanning\n`);
    scanStatus.summary.totalStocks = stocks.length;

    // Load existing scheme database
    const schemeDB = loadSchemeDatabase();
    console.log(`Loaded ${schemeDB.size} existing scheme records\n`);

    // Initialize results
    const allResults: EnhancedStockResult[] = [];
    const highRiskBeforeFilter: EnhancedStockResult[] = [];
    const suspiciousStocks: EnhancedStockResult[] = [];

    // Counters
    let processedCount = 0;
    let skippedNoData = 0;
    let filteredByMarketCap = 0;
    let filteredByVolume = 0;
    let filteredByNews = 0;
    const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 };

    // Phase 1: Run all scans and collect risk scores
    console.log('PHASE 1: Risk Scoring All Stocks');
    console.log('-'.repeat(50));
    scanStatus.phases.phase1_riskScoring.status = 'running';
    scanStatus.phases.phase1_riskScoring.startedAt = new Date().toISOString();

    // Check Python AI Backend availability for full 4-layer analysis
    const pythonAIAvailable = await checkPythonAIHealth();
    scanStatus.aiBackend = {
        configured: !!AI_BACKEND_URL,
        available: pythonAIAvailable,
        layersUsed: pythonAIAvailable
            ? ['Layer 1: Deterministic', 'Layer 2: Anomaly Detection', 'Layer 3: Random Forest', 'Layer 4: LSTM']
            : ['Layer 1: Deterministic'],
    };
    if (pythonAIAvailable) {
        console.log('✅ Python AI Backend ONLINE - Using ALL 4 AI Layers:');
        console.log('   Layer 1: Deterministic Signal Detection (rule-based)');
        console.log('   Layer 2: Statistical Anomaly Detection (Z-scores, Keltner, ATR)');
        console.log('   Layer 3: Machine Learning Classification (Random Forest)');
        console.log('   Layer 4: Deep Learning Sequence Analysis (LSTM)');
    } else {
        console.log('⚠️  Python AI Backend OFFLINE - Using Layer 1 only (TypeScript scorer)');
        console.log('   Set AI_BACKEND_URL environment variable to enable full 4-layer analysis');
    }
    console.log('');


    // For testing, limit to first 100 stocks (remove this for production)
    const stocksToProcess = process.env.TEST_MODE === 'true' ? stocks.slice(0, 100) : stocks;

    for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];
        const progress = ((i + 1) / stocksToProcess.length * 100).toFixed(1);

        process.stdout.write(
            `\r[${progress}%] ${i + 1}/${stocksToProcess.length} | ${stock.symbol.padEnd(6)} | ` +
            `HIGH: ${riskCounts.HIGH}    `
        );

        try {
            const marketData = await fetchStockData(stock.symbol);

            if (!marketData || !marketData.dataAvailable) {
                skippedNoData++;
                continue;
            }

            const extendedQuote = marketData.quote as ExtendedQuote;

            // Run risk scoring
            // If Python AI backend is available, use all 4 layers; otherwise use Layer 1 only
            let scoringResult = computeRiskScore(marketData);  // Layer 1: TypeScript deterministic
            let aiLayers = {
                layer1_deterministic: scoringResult.totalScore,
                layer2_anomaly: null as number | null,
                layer3_rf: null as number | null,
                layer4_lstm: null as number | null,
                combined: null as number | null,
                usedPythonBackend: false
            };

            // Try Python AI backend for full 4-layer analysis
            if (pythonAIAvailable) {
                const pyResult = await callPythonAIBackend(stock.symbol);
                if (pyResult && pyResult.success) {
                    // Cast signals to the expected type (Python backend returns compatible structure)
                    const typedSignals = pyResult.signals.map(s => ({
                        code: s.code,
                        category: s.category as 'STRUCTURAL' | 'PATTERN' | 'ALERT' | 'BEHAVIORAL',
                        weight: s.weight,
                        description: s.description
                    }));

                    // Record AI layer data regardless of override decision
                    aiLayers = {
                        layer1_deterministic: aiLayers.layer1_deterministic,
                        layer2_anomaly: pyResult.anomaly_score,
                        layer3_rf: pyResult.rf_probability,
                        layer4_lstm: pyResult.lstm_probability,
                        combined: pyResult.riskProbability,
                        usedPythonBackend: true
                    };

                    // SAFETY: Never let the Python AI backend downgrade the risk level.
                    // TypeScript deterministic scoring is the trusted baseline.
                    // The Python backend can only ELEVATE risk, never lower it.
                    // This prevents a malfunctioning AI model from masking real threats.
                    const riskOrder: Record<string, number> = { INSUFFICIENT: -1, LOW: 0, MEDIUM: 1, HIGH: 2 };
                    const tsRiskRank = riskOrder[scoringResult.riskLevel] ?? 0;
                    const pyRiskLevel = (pyResult.riskLevel || 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT';
                    const pyRiskRank = riskOrder[pyRiskLevel] ?? 0;

                    if (pyRiskRank >= tsRiskRank) {
                        // Python agrees with or elevates risk — use Python's full result
                        scoringResult = {
                            riskLevel: pyRiskLevel,
                            totalScore: Math.round(pyResult.riskProbability * 20),
                            signals: typedSignals,
                            isLegitimate: false,
                            isInsufficient: false
                        };
                    }
                    // Otherwise keep the TypeScript result (Python tried to downgrade — ignored)
                }
            }

            // Increment risk count
            riskCounts[scoringResult.riskLevel as keyof typeof riskCounts]++;

            const result: EnhancedStockResult = {
                symbol: stock.symbol,
                name: extendedQuote?.companyName || stock.name,
                exchange: extendedQuote?.exchange || stock.exchange,
                sector: extendedQuote?.sector || 'Unknown',
                industry: extendedQuote?.industry || 'Unknown',
                marketCap: extendedQuote?.marketCap || null,
                lastPrice: extendedQuote?.lastPrice || null,
                avgDailyVolume: extendedQuote?.avgVolume30d || null,
                avgDollarVolume: extendedQuote?.avgDollarVolume30d || null,
                riskLevel: scoringResult.riskLevel,
                totalScore: scoringResult.totalScore,
                signals: scoringResult.signals,
                aiLayers: aiLayers,
                isFiltered: false,
                filterReason: null,
                hasLegitimateNews: false,
                newsAnalysis: null,
                recentNews: [],
                secFilings: [],
                socialMediaScanned: false,
                socialMediaFindings: null,
                schemeId: null,
                schemeStatus: null,
                evaluatedAt: new Date().toISOString()
            };

            allResults.push(result);
            processedCount++;

            if (scoringResult.riskLevel === 'HIGH') {
                highRiskBeforeFilter.push(result);
            }

            await sleep(FMP_DELAY_MS);


        } catch (error: any) {
            console.error(`\nError processing ${stock.symbol}:`, error?.message || error);
        }
    }

    console.log('\n\nPhase 1 Complete!');
    console.log(`  Processed: ${processedCount}`);
    console.log(`  Skipped (no data): ${skippedNoData}`);
    console.log(`  Risk Distribution: LOW=${riskCounts.LOW} MEDIUM=${riskCounts.MEDIUM} HIGH=${riskCounts.HIGH}`);
    console.log(`  High-risk stocks to analyze: ${highRiskBeforeFilter.length}`);

    // Sanity check: detect malfunctioning Python AI backend
    if (pythonAIAvailable && processedCount > 100) {
        const pyUsedCount = allResults.filter(r => r.aiLayers?.usedPythonBackend).length;
        const pyAllLow = allResults.every(r => r.riskLevel === 'LOW');
        const tsWouldHaveHigh = allResults.filter(r =>
            (r.aiLayers?.layer1_deterministic ?? 0) >= 5
        ).length;
        const tsWouldHaveMedium = allResults.filter(r => {
            const l1 = r.aiLayers?.layer1_deterministic ?? 0;
            return l1 >= 2 && l1 < 5;
        }).length;

        if (pyUsedCount > 0 && pyAllLow && (tsWouldHaveHigh > 0 || tsWouldHaveMedium > 0)) {
            console.log('\n  ⚠️  WARNING: Python AI backend may be malfunctioning!');
            console.log(`     Python backend was used for ${pyUsedCount} stocks but ALL results are LOW.`);
            console.log(`     TypeScript scorer would have flagged: ${tsWouldHaveHigh} HIGH, ${tsWouldHaveMedium} MEDIUM`);
            console.log('     The no-downgrade safety rule preserved TypeScript scores.');
        }
    }

    scanStatus.phases.phase1_riskScoring.status = 'completed';
    scanStatus.phases.phase1_riskScoring.completedAt = new Date().toISOString();
    scanStatus.phases.phase1_riskScoring.durationMs = Date.now() - new Date(scanStatus.phases.phase1_riskScoring.startedAt!).getTime();
    scanStatus.phases.phase1_riskScoring.details = {
        processed: processedCount,
        skippedNoData,
        riskCounts: { ...riskCounts },
        highRiskFound: highRiskBeforeFilter.length,
    };
    scanStatus.summary.processed = processedCount;
    scanStatus.summary.skippedNoData = skippedNoData;
    scanStatus.summary.riskCounts = { ...riskCounts };
    scanStatus.summary.highRiskBeforeFilters = highRiskBeforeFilter.length;

    // Phase 2: Filter high-risk stocks
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 2: Filtering High-Risk Stocks');
    console.log('-'.repeat(50));
    scanStatus.phases.phase2_sizeFiltering.status = 'running';
    scanStatus.phases.phase2_sizeFiltering.startedAt = new Date().toISOString();

    const afterSizeFilter: EnhancedStockResult[] = [];

    for (const result of highRiskBeforeFilter) {
        const sizeFilter = shouldFilterBySize(result as unknown as ExtendedQuote);

        if (sizeFilter.filtered) {
            result.isFiltered = true;
            result.filterReason = sizeFilter.reason;

            if (sizeFilter.reason?.includes('market cap')) {
                filteredByMarketCap++;
            } else {
                filteredByVolume++;
            }
        } else {
            afterSizeFilter.push(result);
        }
    }

    console.log(`  Filtered by market cap: ${filteredByMarketCap}`);
    console.log(`  Filtered by volume: ${filteredByVolume}`);
    console.log(`  Remaining for news check: ${afterSizeFilter.length}`);

    scanStatus.phases.phase2_sizeFiltering.status = 'completed';
    scanStatus.phases.phase2_sizeFiltering.completedAt = new Date().toISOString();
    scanStatus.phases.phase2_sizeFiltering.durationMs = Date.now() - new Date(scanStatus.phases.phase2_sizeFiltering.startedAt!).getTime();
    scanStatus.phases.phase2_sizeFiltering.details = {
        filteredByMarketCap,
        filteredByVolume,
        remainingForNewsCheck: afterSizeFilter.length,
    };
    scanStatus.summary.filteredByMarketCap = filteredByMarketCap;
    scanStatus.summary.filteredByVolume = filteredByVolume;

    // Phase 3: News & SEC Filing Analysis
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 3: News & SEC Filing Analysis');
    console.log('-'.repeat(50));
    scanStatus.phases.phase3_newsAnalysis.status = 'running';
    scanStatus.phases.phase3_newsAnalysis.startedAt = new Date().toISOString();

    const afterNewsFilter: EnhancedStockResult[] = [];

    for (let i = 0; i < afterSizeFilter.length; i++) {
        const result = afterSizeFilter[i];
        console.log(`[${i + 1}/${afterSizeFilter.length}] Analyzing ${result.symbol}...`);

        // Fetch news and filings (with defensive array checks)
        const newsRaw = await fetchStockNews(result.symbol);
        const news = Array.isArray(newsRaw) ? newsRaw : [];
        await sleep(300);

        const secFilingsRaw = await fetchSECFilings(result.symbol);
        const secFilings = Array.isArray(secFilingsRaw) ? secFilingsRaw : [];
        await sleep(300);

        const pressReleasesRaw = await fetchPressReleases(result.symbol);
        const pressReleases = Array.isArray(pressReleasesRaw) ? pressReleasesRaw : [];
        await sleep(300);

        // Store news data
        result.recentNews = news.slice(0, 5).map((n: any) => ({
            title: n?.title || '',
            date: n?.publishedDate || '',
            source: n?.site || '',
            url: n?.url || ''
        }));

        result.secFilings = secFilings.slice(0, 5).map((f: any) => ({
            type: f?.type || '',
            date: f?.fillingDate || f?.date || '',
            url: f?.finalLink || f?.link || ''
        }));

        // Analyze legitimacy
        const newsAnalysis = await analyzeNewsLegitimacy(
            result.symbol,
            result.name,
            result.signals,
            news,
            secFilings,
            pressReleases
        );

        result.hasLegitimateNews = newsAnalysis.hasLegitimateNews;
        result.newsAnalysis = newsAnalysis.analysis;

        if (newsAnalysis.hasLegitimateNews) {
            result.isFiltered = true;
            result.filterReason = `Legitimate news: ${newsAnalysis.analysis}`;
            filteredByNews++;
            console.log(`  ✓ Filtered - Legitimate news found`);
        } else {
            afterNewsFilter.push(result);
            console.log(`  ⚠ No legitimate news - remains suspicious`);
        }

        await sleep(500);
    }

    console.log(`\n  Filtered by legitimate news: ${filteredByNews}`);
    console.log(`  Remaining suspicious stocks: ${afterNewsFilter.length}`);

    scanStatus.phases.phase3_newsAnalysis.status = 'completed';
    scanStatus.phases.phase3_newsAnalysis.completedAt = new Date().toISOString();
    scanStatus.phases.phase3_newsAnalysis.durationMs = Date.now() - new Date(scanStatus.phases.phase3_newsAnalysis.startedAt!).getTime();
    scanStatus.phases.phase3_newsAnalysis.details = {
        stocksAnalyzed: afterSizeFilter.length,
        filteredByNews,
        remainingSuspicious: afterNewsFilter.length,
    };
    scanStatus.summary.filteredByNews = filteredByNews;

    // Phase 4: Social Media Scanning (Modular Orchestrator)
    // Uses all configured scanners: Google CSE, Perplexity, Reddit OAuth, YouTube, StockTwits, Discord
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 4: Social Media Scanning (Modular Orchestrator)');
    console.log('-'.repeat(50));
    scanStatus.phases.phase4_socialMedia.status = 'running';
    scanStatus.phases.phase4_socialMedia.startedAt = new Date().toISOString();

    if (afterNewsFilter.length > 0) {
        // Convert pipeline stocks to ScanTarget format for the modular orchestrator
        const scanTargets: ScanTarget[] = afterNewsFilter.map(r => ({
            ticker: r.symbol,
            name: r.name,
            riskScore: r.totalScore,
            riskLevel: r.riskLevel as 'HIGH' | 'MEDIUM' | 'LOW',
            signals: r.signals.map(s => s.code),
        }));

        // Run all configured scanners in one batch call
        const scanRunResult = await runSocialScan({
            tickers: scanTargets,
            date: evaluationDate,
            scanId: `pipeline-${evaluationDate}-${Date.now()}`,
        });

        console.log(`\n  Orchestrator status: ${scanRunResult.status}`);
        console.log(`  Platforms used: ${scanRunResult.platformsUsed.join(', ') || 'none'}`);
        console.log(`  Total mentions found: ${scanRunResult.totalMentions}`);
        if (scanRunResult.errors.length > 0) {
            console.log(`  Errors: ${scanRunResult.errors.join('; ')}`);
        }

        // Map results back to each stock in afterNewsFilter
        for (const result of afterNewsFilter) {
            const tickerResult = scanRunResult.results.find(
                r => r.ticker.toUpperCase() === result.symbol.toUpperCase()
            );

            if (tickerResult) {
                const socialFindings = tickerResultToComprehensiveScan(tickerResult);
                result.socialMediaScanned = true;
                result.socialMediaFindings = socialFindings;

                if (socialFindings.overallPromotionScore >= 60) {
                    console.log(`  🔴 ${result.symbol}: HIGH promotion score: ${socialFindings.overallPromotionScore}/100`);
                } else if (socialFindings.overallPromotionScore >= 40) {
                    console.log(`  🟡 ${result.symbol}: MEDIUM promotion score: ${socialFindings.overallPromotionScore}/100`);
                } else {
                    console.log(`  🟢 ${result.symbol}: LOW promotion score: ${socialFindings.overallPromotionScore}/100`);
                }
            } else {
                result.socialMediaScanned = true;
                result.socialMediaFindings = null;
                console.log(`  ⚪ ${result.symbol}: No scan results returned`);
            }

            suspiciousStocks.push(result);
        }
        // Capture social media platform-level details for scan status
        scanStatus.socialMediaDetails = {
            platformsUsed: scanRunResult.platformsUsed,
            platformResults: scanRunResult.results.length > 0
                ? scanRunResult.results[0].platforms.map(p => ({
                    platform: p.platform,
                    scanner: p.scanner,
                    configured: true,
                    success: p.success,
                    mentionsFound: p.mentionsFound,
                    error: p.error || null,
                }))
                : [],
            totalMentions: scanRunResult.totalMentions,
            tickersScanned: scanRunResult.tickersScanned,
            tickersWithMentions: scanRunResult.tickersWithMentions,
        };
    } else {
        console.log('  No suspicious stocks to scan.');
    }

    scanStatus.phases.phase4_socialMedia.status = 'completed';
    scanStatus.phases.phase4_socialMedia.completedAt = new Date().toISOString();
    scanStatus.phases.phase4_socialMedia.durationMs = Date.now() - new Date(scanStatus.phases.phase4_socialMedia.startedAt!).getTime();
    scanStatus.phases.phase4_socialMedia.details = {
        tickersScanned: afterNewsFilter.length,
        platformsUsed: scanStatus.socialMediaDetails.platformsUsed,
        totalMentions: scanStatus.socialMediaDetails.totalMentions,
    };

    // Phase 5: Scheme Tracking
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 5: Scheme Tracking & Numbering');
    console.log('-'.repeat(50));
    scanStatus.phases.phase5_schemeTracking.status = 'running';
    scanStatus.phases.phase5_schemeTracking.startedAt = new Date().toISOString();

    let newSchemes = 0;
    let ongoingSchemes = 0;
    let coolingSchemes = 0;
    let resolvedSchemes = 0;
    let noScamSchemes = 0;

    // STEP 5a: Update stale schemes (not seen for 7+ days) and check for lifecycle transitions
    // New status labels:
    // - PUMP_AND_DUMP_ENDED: Saw full P&D cycle WITH social media promotion
    // - PUMP_AND_DUMP_ENDED_NO_PROMO: Saw full P&D cycle WITHOUT social media evidence
    // - NO_SCAM_DETECTED: Went inactive without showing full P&D pattern
    const symbolsSeenToday = new Set(suspiciousStocks.map(s => s.symbol));
    const allHighRiskSymbols = new Set(allResults.filter(r => r.riskLevel === 'HIGH').map(r => r.symbol));

    const schemeEntries = Array.from(schemeDB.entries());
    for (const [schemeId, scheme] of schemeEntries) {

        // Skip already resolved schemes
        if (['PUMP_AND_DUMP_ENDED', 'PUMP_AND_DUMP_ENDED_NO_PROMO', 'NO_SCAM_DETECTED', 'CONFIRMED_FRAUD'].includes(scheme.status)) {
            continue;
        }

        const lastSeenDate = new Date(scheme.lastSeen);
        const today = new Date(evaluationDate);
        const daysSinceLastSeen = Math.floor((today.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysActive = Math.floor((today.getTime() - new Date(scheme.firstDetected).getTime()) / (1000 * 60 * 60 * 24));

        // Check if scheme should be marked as NO_SCAM_DETECTED (not seen for 7+ days, never showed full P&D pattern)
        // This is for stocks that looked suspicious but never developed into actual schemes
        if (daysSinceLastSeen >= 7 && !allHighRiskSymbols.has(scheme.symbol) && scheme.status !== 'COOLING') {
            scheme.status = 'NO_SCAM_DETECTED';
            scheme.resolutionDetails = `No pump-and-dump pattern detected after ${daysActive || 1} days of monitoring. Stock activity normalized.`;
            scheme.timeline.push({
                date: evaluationDate,
                event: 'No scam detected - closing investigation',
                details: `Monitored for ${daysActive || 1} days, inactive for ${daysSinceLastSeen} days. No full pump-and-dump pattern observed.`,
                category: 'status_change',
                significance: 'high'
            });
            noScamSchemes++;
            console.log(`  ⚪ NO SCAM DETECTED: ${schemeId} (${scheme.symbol}) - never showed full P&D pattern`);
            continue;
        }

        // Check for COOLING status (price dropped >30% from peak) for ONGOING schemes
        if (scheme.status === 'ONGOING') {

            // Get current price from today's scan if available
            const currentResult = allResults.find(r => r.symbol === scheme.symbol);
            if (currentResult && currentResult.lastPrice && scheme.peakPrice > 0) {
                const priceChangeFromPeak = ((currentResult.lastPrice - scheme.peakPrice) / scheme.peakPrice) * 100;

                if (priceChangeFromPeak < -30) {
                    scheme.status = 'COOLING';
                    scheme.currentPrice = currentResult.lastPrice;
                    scheme.priceChangeFromPeak = priceChangeFromPeak;
                    scheme.timeline.push({
                        date: evaluationDate,
                        event: 'Status changed to COOLING - Possible dump detected',
                        details: `Price dropped ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak ($${scheme.peakPrice.toFixed(2)} → $${currentResult.lastPrice.toFixed(2)})`,
                        category: 'status_change',
                        significance: 'high'
                    });
                    coolingSchemes++;
                    console.log(`  🔵 Cooling scheme detected: ${schemeId} (${scheme.symbol}) - price down ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak`);
                }
            }
        }

        // Check if COOLING schemes should be marked as PUMP_AND_DUMP_ENDED (price dropped >50%)
        if (scheme.status === 'COOLING') {
            const currentResult = allResults.find(r => r.symbol === scheme.symbol);
            if (currentResult && currentResult.lastPrice && scheme.peakPrice > 0) {
                const priceChangeFromPeak = ((currentResult.lastPrice - scheme.peakPrice) / scheme.peakPrice) * 100;

                // Mark as PUMP_AND_DUMP_ENDED if price is 50%+ below peak (dump complete)
                if (priceChangeFromPeak < -50) {
                    // Determine status based on whether social media promotion was detected
                    const hadSocialPromo = scheme.hadSocialMediaPromotion || scheme.promotionPlatforms.length > 0;
                    scheme.status = hadSocialPromo ? 'PUMP_AND_DUMP_ENDED' : 'PUMP_AND_DUMP_ENDED_NO_PROMO';
                    scheme.currentPrice = currentResult.lastPrice;
                    scheme.resolutionDetails = hadSocialPromo
                        ? `PUMP & DUMP CONFIRMED: Price crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak. Social media promotion detected on: ${scheme.promotionPlatforms.join(', ')}`
                        : `PUMP & DUMP CYCLE DETECTED: Price crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak. No social media promotion evidence found.`;
                    scheme.timeline.push({
                        date: evaluationDate,
                        event: hadSocialPromo ? 'PUMP & DUMP ENDED - With social promotion' : 'PUMP & DUMP ENDED - No social evidence',
                        details: `Price crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak ($${scheme.peakPrice.toFixed(2)} → $${currentResult.lastPrice.toFixed(2)})`,
                        category: 'status_change',
                        significance: 'high'
                    });
                    resolvedSchemes++;
                    console.log(`  ⚫ PUMP & DUMP ENDED: ${schemeId} (${scheme.symbol}) - crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% | Social promo: ${hadSocialPromo ? 'YES' : 'NO'}`);
                }
            }
        }
    }

    console.log(`\n  Scheme lifecycle updates:`);
    console.log(`    Cooling (price dropping): ${coolingSchemes}`);
    console.log(`    Pump & Dump Ended: ${resolvedSchemes}`);
    console.log(`    No Scam Detected: ${noScamSchemes}`);
    console.log('');

    for (const result of suspiciousStocks) {
        // Check if this stock is already in scheme database (only check active schemes)
        const activeStatuses = ['NEW', 'ONGOING', 'COOLING'];
        const existingScheme = Array.from(schemeDB.values()).find(
            s => s.symbol === result.symbol && activeStatuses.includes(s.status)
        );

        if (existingScheme) {
            // Update existing scheme
            existingScheme.lastSeen = evaluationDate;
            existingScheme.currentRiskScore = result.totalScore;
            existingScheme.currentPrice = result.lastPrice || existingScheme.currentPrice;
            existingScheme.currentVolume = result.avgDailyVolume || existingScheme.currentVolume || 0;
            existingScheme.status = 'ONGOING';

            // Update peak tracking
            if (result.totalScore > (existingScheme.peakRiskScore || 0)) {
                existingScheme.peakRiskScore = result.totalScore;
            }
            if (existingScheme.currentPrice > (existingScheme.peakPrice || 0)) {
                existingScheme.peakPrice = existingScheme.currentPrice;
            }
            if (existingScheme.priceAtDetection > 0) {
                existingScheme.priceChangeFromDetection =
                    ((existingScheme.currentPrice - existingScheme.priceAtDetection) / existingScheme.priceAtDetection) * 100;
                existingScheme.priceChangeFromPeak =
                    ((existingScheme.currentPrice - (existingScheme.peakPrice || existingScheme.priceAtDetection)) / (existingScheme.peakPrice || existingScheme.priceAtDetection)) * 100;
            }

            if (result.socialMediaFindings) {
                const newPlatforms = result.socialMediaFindings.platforms
                    .filter(p => p.promotionRisk === 'high')
                    .map(p => p.platform);
                existingScheme.promotionPlatforms = Array.from(new Set([...existingScheme.promotionPlatforms, ...newPlatforms]));

                // Update promotion score
                existingScheme.currentPromotionScore = result.socialMediaFindings.overallPromotionScore;
                if (result.socialMediaFindings.overallPromotionScore > (existingScheme.peakPromotionScore || 0)) {
                    existingScheme.peakPromotionScore = result.socialMediaFindings.overallPromotionScore;
                }

                // Merge new promoter accounts (structured objects)
                if (!Array.isArray(existingScheme.promoterAccounts)) {
                    existingScheme.promoterAccounts = [];
                }
                for (const p of result.socialMediaFindings.potentialPromoters) {
                    const existing = existingScheme.promoterAccounts.find(
                        (a: { platform: string; identifier: string }) =>
                            a.platform === p.platform && a.identifier === p.username
                    );
                    if (existing) {
                        existing.lastSeen = evaluationDate;
                        existing.postCount += p.postCount;
                        if (p.confidence === 'high') existing.confidence = 'high';
                    } else {
                        existingScheme.promoterAccounts.push({
                            platform: p.platform,
                            identifier: p.username,
                            firstSeen: evaluationDate,
                            lastSeen: evaluationDate,
                            postCount: p.postCount,
                            confidence: p.confidence,
                        });
                    }
                }

                // Merge signals
                if (existingScheme.signalsDetected) {
                    const newSignals = result.signals.map(s => s.code);
                    existingScheme.signalsDetected = Array.from(new Set([...existingScheme.signalsDetected, ...newSignals]));
                }
            }

            existingScheme.timeline.push({
                date: evaluationDate,
                event: 'Daily scan update',
                details: `Risk score: ${result.totalScore}, Promotion score: ${result.socialMediaFindings?.overallPromotionScore || 'N/A'}`
            });

            result.schemeId = existingScheme.schemeId;
            result.schemeStatus = 'ONGOING';
            ongoingSchemes++;

            console.log(`  Updated ongoing scheme: ${existingScheme.schemeId}`);

        } else if (result.socialMediaFindings && result.socialMediaFindings.overallPromotionScore >= 50) {
            // Create new scheme record
            const schemeId = generateSchemeId(result.symbol, evaluationDate);

            const highRiskPlatforms = result.socialMediaFindings.platforms
                .filter(p => p.promotionRisk === 'high');
            const coordinationIndicators = highRiskPlatforms
                .map(p => `High promotion risk on ${p.platform}`);

            const newScheme: SchemeRecord = {
                schemeId,
                symbol: result.symbol,
                name: result.name,
                sector: result.sector || 'Unknown',
                industry: result.industry || 'Unknown',
                firstDetected: evaluationDate,
                lastSeen: evaluationDate,
                daysActive: 1,
                status: 'NEW',
                peakRiskScore: result.totalScore,
                currentRiskScore: result.totalScore,
                peakPromotionScore: result.socialMediaFindings.overallPromotionScore,
                currentPromotionScore: result.socialMediaFindings.overallPromotionScore,
                promotionPlatforms: highRiskPlatforms.map(p => p.platform),
                // Map promoter objects properly (username → identifier)
                promoterAccounts: result.socialMediaFindings.potentialPromoters.map(p => ({
                    platform: p.platform,
                    identifier: p.username,
                    firstSeen: evaluationDate,
                    lastSeen: evaluationDate,
                    postCount: p.postCount,
                    confidence: p.confidence,
                })),
                // Track whether we have REAL social media evidence (not AI predictions)
                hadSocialMediaPromotion: result.socialMediaFindings.platforms
                    .some(p => p.promotionRisk === 'high' && p.dataSource === 'real'),
                priceAtDetection: result.lastPrice || 0,
                peakPrice: result.lastPrice || 0,
                currentPrice: result.lastPrice || 0,
                priceChangeFromDetection: 0,
                priceChangeFromPeak: 0,
                volumeAtDetection: result.avgDailyVolume || 0,
                peakVolume: result.avgDailyVolume || 0,
                currentVolume: result.avgDailyVolume || 0,
                signalsDetected: result.signals.map(s => s.code),
                coordinationIndicators,
                notes: [`Initial detection with promotion score ${result.socialMediaFindings.overallPromotionScore}`],
                investigationFlags: [],
                timeline: [{
                    date: evaluationDate,
                    event: 'Scheme detected',
                    category: 'detection',
                    details: `Initial detection with risk score ${result.totalScore} and promotion score ${result.socialMediaFindings.overallPromotionScore}`,
                    significance: 'high'
                }]
            };

            schemeDB.set(schemeId, newScheme);
            result.schemeId = schemeId;
            result.schemeStatus = 'NEW';
            newSchemes++;

            console.log(`  🆕 New scheme created: ${schemeId}`);
        }
    }

    // Save scheme database
    saveSchemeDatabase(schemeDB);

    console.log(`\n  New schemes detected: ${newSchemes}`);
    console.log(`  Ongoing schemes updated: ${ongoingSchemes}`);
    console.log(`  Total active schemes: ${schemeDB.size}`);

    scanStatus.phases.phase5_schemeTracking.status = 'completed';
    scanStatus.phases.phase5_schemeTracking.completedAt = new Date().toISOString();
    scanStatus.phases.phase5_schemeTracking.durationMs = Date.now() - new Date(scanStatus.phases.phase5_schemeTracking.startedAt!).getTime();
    scanStatus.phases.phase5_schemeTracking.details = {
        newSchemes,
        ongoingSchemes,
        coolingSchemes,
        resolvedSchemes,
        noScamSchemes,
        totalActiveSchemes: schemeDB.size,
    };
    scanStatus.summary.remainingSuspicious = suspiciousStocks.length;
    scanStatus.summary.newSchemes = newSchemes;
    scanStatus.summary.ongoingSchemes = ongoingSchemes;
    scanStatus.summary.totalActiveSchemes = schemeDB.size;

    // Generate reports
    const endTime = Date.now();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const report: DailyReport = {
        date: evaluationDate,
        totalStocksScanned: processedCount,
        byRiskLevel: riskCounts,
        highRiskBeforeFilters: highRiskBeforeFilter.length,
        filteredByMarketCap,
        filteredByVolume,
        filteredByNews,
        remainingSuspicious: suspiciousStocks.length,
        activeSchemes: schemeDB.size,
        newSchemes,
        processingTimeMinutes: durationMinutes
    };

    // Save all results
    const fullResultsPath = path.join(RESULTS_DIR, `enhanced-evaluation-${evaluationDate}.json`);
    fs.writeFileSync(fullResultsPath, JSON.stringify(allResults, null, 2));

    const highRiskPath = path.join(RESULTS_DIR, `enhanced-high-risk-${evaluationDate}.json`);
    fs.writeFileSync(highRiskPath, JSON.stringify(highRiskBeforeFilter, null, 2));

    const suspiciousPath = path.join(RESULTS_DIR, `suspicious-stocks-${evaluationDate}.json`);
    fs.writeFileSync(suspiciousPath, JSON.stringify(suspiciousStocks, null, 2));

    const reportPath = path.join(RESULTS_DIR, `daily-report-${evaluationDate}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate fmp-summary (legacy format used by data ingestion)
    const byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }> = {};
    for (const result of allResults) {
        const exchange = result.exchange || 'Unknown';
        // Normalize exchange names
        let normalizedExchange = exchange;
        if (exchange.includes('NASDAQ') || exchange.includes('NMS') || exchange.includes('NGM') || exchange.includes('NCM')) {
            normalizedExchange = 'NASDAQ';
        } else if (exchange.includes('NYSE') || exchange.includes('NYQ')) {
            normalizedExchange = 'NYSE';
        } else if (exchange.includes('AMEX') || exchange.includes('ASE')) {
            normalizedExchange = 'AMEX';
        } else if (exchange.includes('OTC') || exchange.includes('PINK')) {
            normalizedExchange = 'OTC';
        }

        if (!byExchange[normalizedExchange]) {
            byExchange[normalizedExchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
        }
        byExchange[normalizedExchange].total++;
        if (result.riskLevel === 'LOW' || result.riskLevel === 'MEDIUM' || result.riskLevel === 'HIGH') {
            byExchange[normalizedExchange][result.riskLevel]++;
        }
    }

    const summary = {
        totalStocks: stocks.length,
        evaluated: processedCount,
        skippedNoData: skippedNoData,
        byRiskLevel: riskCounts,
        byExchange,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMinutes,
        apiCallsMade: processedCount * 2 // estimate: 1 profile + 1 history per stock
    };

    const summaryPath = path.join(RESULTS_DIR, `fmp-summary-${evaluationDate}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Generate social-media-scan file (standalone social media data)
    const socialMediaResults = suspiciousStocks
        .filter(s => s.socialMediaScanned && s.socialMediaFindings)
        .map(s => ({
            symbol: s.symbol,
            name: s.name,
            riskScore: s.totalScore,
            signals: s.signals.map(sig => sig.code),
            hasLegitimateNews: s.hasLegitimateNews,
            newsAnalysis: s.newsAnalysis,
            recentNews: s.recentNews,
            socialMediaMentions: s.socialMediaFindings!.platforms.map(p => ({
                platform: p.platform,
                source: p.dataSource,
                mentionsFound: p.mentionsFound,
                activityLevel: p.overallActivityLevel,
                promotionRisk: p.promotionRisk,
            })),
            overallPromotionScore: s.socialMediaFindings!.overallPromotionScore,
            promotionRiskLevel: s.socialMediaFindings!.riskLevel,
            hasRealSocialEvidence: s.socialMediaFindings!.hasRealSocialEvidence,
            potentialPromoters: s.socialMediaFindings!.potentialPromoters,
            overallAssessment: s.socialMediaFindings!.summary,
            scanDate: evaluationDate
        }));

    const socialScanData = {
        scanDate: evaluationDate,
        totalScanned: suspiciousStocks.length,
        socialMediaScannedCount: socialMediaResults.length,
        highPromotionCount: socialMediaResults.filter(r => r.overallPromotionScore >= 60).length,
        mediumPromotionCount: socialMediaResults.filter(r => r.overallPromotionScore >= 40 && r.overallPromotionScore < 60).length,
        results: socialMediaResults
    };

    const socialScanPath = path.join(RESULTS_DIR, `social-media-scan-${evaluationDate}.json`);
    fs.writeFileSync(socialScanPath, JSON.stringify(socialScanData, null, 2));

    // Generate promoted-stocks file (stocks with high promotion scores)
    const promotedStocks = suspiciousStocks
        .filter(s => s.socialMediaScanned && s.socialMediaFindings)
        .map(s => {
            const promo = s.socialMediaFindings!;
            const highRiskPlatforms = promo.platforms
                .filter(p => p.promotionRisk === 'high')
                .map(p => p.platform);
            const allPlatforms = promo.platforms
                .filter(p => p.mentionsFound > 0)
                .map(p => p.platform);

            let marketCapStr: string | null = null;
            if (s.marketCap) {
                if (s.marketCap >= 1_000_000_000) {
                    marketCapStr = `${(s.marketCap / 1_000_000_000).toFixed(1)}B`;
                } else if (s.marketCap >= 1_000_000) {
                    marketCapStr = `${(s.marketCap / 1_000_000).toFixed(1)}M`;
                } else {
                    marketCapStr = `${(s.marketCap / 1_000).toFixed(0)}K`;
                }
            }

            return {
                symbol: s.symbol,
                name: s.name,
                riskScore: s.totalScore,
                price: s.lastPrice || null,
                marketCap: marketCapStr,
                tier: promo.overallPromotionScore >= 60 ? 'HIGH' : promo.overallPromotionScore >= 40 ? 'MEDIUM' : 'STRUCTURAL',
                platforms: allPlatforms.length > 0 ? allPlatforms : highRiskPlatforms,
                redFlags: s.signals.map(sig => sig.description),
                sources: promo.platforms
                    .filter(p => p.mentionsFound > 0)
                    .map(p => `${p.platform}: ${p.mentionsFound} mentions (${p.dataSource})`),
                assessment: promo.summary || null
            };
        })
        .sort((a, b) => b.riskScore - a.riskScore);

    const promotedReport = {
        date: evaluationDate,
        totalHighRiskStocks: highRiskBeforeFilter.length,
        promotedStocks
    };

    const promotedPath = path.join(RESULTS_DIR, `promoted-stocks-${evaluationDate}.json`);
    fs.writeFileSync(promotedPath, JSON.stringify(promotedReport, null, 2));

    // Save scan status (success)
    scanStatus.pipelineStatus = 'completed';
    scanStatus.completedAt = new Date().toISOString();
    scanStatus.durationMinutes = durationMinutes;
    saveScanStatus(scanStatus);

    // Print final summary
    console.log('\n' + '='.repeat(80));
    console.log('PIPELINE COMPLETE');
    console.log('='.repeat(80));
    console.log(`\nProcessing Summary:`);
    console.log(`  Total stocks scanned: ${processedCount}`);
    console.log(`  Duration: ${durationMinutes} minutes`);
    console.log(`\nRisk Distribution:`);
    console.log(`  HIGH: ${riskCounts.HIGH}`);
    console.log(`  MEDIUM: ${riskCounts.MEDIUM}`);
    console.log(`  LOW: ${riskCounts.LOW}`);
    console.log(`\nFiltering Pipeline:`);
    console.log(`  High-risk before filters: ${highRiskBeforeFilter.length}`);
    console.log(`  └─ Filtered by market cap: ${filteredByMarketCap}`);
    console.log(`  └─ Filtered by volume: ${filteredByVolume}`);
    console.log(`  └─ Filtered by legitimate news: ${filteredByNews}`);
    console.log(`  └─ Remaining suspicious: ${suspiciousStocks.length}`);
    console.log(`\nScheme Tracking:`);
    console.log(`  New schemes detected: ${newSchemes}`);
    console.log(`  Ongoing schemes: ${ongoingSchemes}`);
    console.log(`  Total active schemes: ${schemeDB.size}`);
    console.log(`\nOutput Files:`);
    console.log(`  Full results: ${fullResultsPath}`);
    console.log(`  High-risk stocks: ${highRiskPath}`);
    console.log(`  Suspicious stocks: ${suspiciousPath}`);
    console.log(`  Daily report: ${reportPath}`);
    console.log(`  Summary (legacy): ${summaryPath}`);
    console.log(`  Social media scan: ${socialScanPath}`);
    console.log(`  Promoted stocks: ${promotedPath}`);
    console.log(`  Scheme database: ${path.join(SCHEME_DB_DIR, 'scheme-database.json')}`);

    // Print top suspicious stocks
    if (suspiciousStocks.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('TOP SUSPICIOUS STOCKS');
        console.log('='.repeat(80));

        const sortedSuspicious = [...suspiciousStocks].sort((a, b) => {
            const aScore = (a.socialMediaFindings?.overallPromotionScore || 0) + a.totalScore;
            const bScore = (b.socialMediaFindings?.overallPromotionScore || 0) + b.totalScore;
            return bScore - aScore;
        });

        sortedSuspicious.slice(0, 10).forEach((s, i) => {
            const promotionScore = s.socialMediaFindings?.overallPromotionScore || 0;
            console.log(`\n${i + 1}. ${s.symbol} (${s.name})`);
            console.log(`   Risk Score: ${s.totalScore} | Promotion Score: ${promotionScore}`);
            console.log(`   Signals: ${s.signals.map(sig => sig.code).join(', ')}`);
            if (s.schemeId) {
                console.log(`   Scheme ID: ${s.schemeId} (${s.schemeStatus})`);
            }
            if (s.socialMediaFindings?.summary) {
                console.log(`   Summary: ${s.socialMediaFindings.summary}`);
            }
        });
    }
}

// Run pipeline
runEnhancedPipeline()
    .then(() => {
        console.log('\n✅ Enhanced daily pipeline completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Pipeline failed:', error);

        // Attempt to save crash status and send notification
        try {
            const evaluationDate = getEvaluationDate();
            const statusPath = path.join(RESULTS_DIR, `scan-status-${evaluationDate}.json`);
            let scanStatus: ScanStatus;

            // Try to load partial status (written during pipeline phases)
            if (fs.existsSync(statusPath)) {
                scanStatus = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
            } else {
                scanStatus = createInitialScanStatus(evaluationDate);
            }

            // Mark running phase as failed
            for (const phase of Object.values(scanStatus.phases)) {
                if (phase.status === 'running') {
                    phase.status = 'failed';
                    phase.error = error?.message || String(error);
                    phase.completedAt = new Date().toISOString();
                    if (phase.startedAt) {
                        phase.durationMs = Date.now() - new Date(phase.startedAt).getTime();
                    }
                    scanStatus.failedAtPhase = phase.name;
                    break;
                }
            }

            scanStatus.pipelineStatus = 'failed';
            scanStatus.completedAt = new Date().toISOString();
            scanStatus.error = error?.message || String(error);
            scanStatus.durationMinutes = Math.round((Date.now() - new Date(scanStatus.startedAt).getTime()) / 60000);
            saveScanStatus(scanStatus);

            sendCrashNotification(scanStatus);
        } catch (crashErr) {
            console.error('Failed to save crash status:', crashErr);
        }

        process.exit(1);
    });
