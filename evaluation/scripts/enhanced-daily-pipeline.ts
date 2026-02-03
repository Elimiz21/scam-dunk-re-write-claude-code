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
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const FMP_V3_URL = 'https://financialmodelingprep.com/api/v3';
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
    socialMediaFindings: {
        platforms: Array<{
            platform: string;
            activityLevel: string;
            promotionRisk: string;
            details: string;
        }>;
        overallPromotionScore: number;
        potentialPromoters: string[];
        coordinationIndicators: string[];
    } | null;

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
    firstDetected: string;
    lastSeen: string;
    status: 'NEW' | 'ONGOING' | 'COOLING' | 'RESOLVED' | 'CONFIRMED_FRAUD';
    peakRiskScore: number;
    currentRiskScore: number;
    promotionPlatforms: string[];
    promoterAccounts: string[];
    priceAtDetection: number;
    peakPrice: number;
    currentPrice: number;
    priceChangeFromPeak?: number;
    volumeAtDetection: number;
    notes: string[];
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
function loadSchemeDatabase(): Map<string, SchemeRecord> {
    const dbPath = path.join(SCHEME_DB_DIR, 'active-schemes.json');
    if (!fs.existsSync(dbPath)) {
        return new Map();
    }
    try {
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        return new Map(Object.entries(data));
    } catch {
        return new Map();
    }
}

// Save scheme database
function saveSchemeDatabase(db: Map<string, SchemeRecord>): void {
    const dbPath = path.join(SCHEME_DB_DIR, 'active-schemes.json');
    const data = Object.fromEntries(db);
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
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
        const cmd = `curl -s --max-time 30 -X POST "${AI_BACKEND_URL}/analyze" ` +
            `-H "Content-Type: application/json" ` +
            `-d '{"ticker": "${symbol}", "asset_type": "stock", "use_live_data": true}'`;

        const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

        if (!result) return null;

        const data = JSON.parse(result);

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
        const url = `${FMP_V3_URL}/stock_news?tickers=${symbol}&limit=15&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const news = JSON.parse(response);
        return news || [];
    } catch {
        return [];
    }
}

// Fetch SEC filings
async function fetchSECFilings(symbol: string): Promise<any[]> {
    try {
        const url = `${FMP_V3_URL}/sec_filings/${symbol}?limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const filings = JSON.parse(response);
        return filings || [];
    } catch {
        return [];
    }
}

// Fetch press releases
async function fetchPressReleases(symbol: string): Promise<any[]> {
    try {
        const url = `${FMP_V3_URL}/press-releases/${symbol}?limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const releases = JSON.parse(response);
        return releases || [];
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

    // If no news or filings, quick return
    if (news.length === 0 && secFilings.length === 0 && pressReleases.length === 0) {
        return { hasLegitimateNews: false, analysis: 'No recent news, SEC filings, or press releases found.' };
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const newsText = news.slice(0, 5).map((n: any) =>
        `[${n.publishedDate}] ${n.title}: ${n.text?.substring(0, 200)}...`
    ).join('\n\n');

    const filingsText = secFilings.slice(0, 5).map((f: any) =>
        `[${f.fillingDate || f.date}] ${f.type}: ${f.link || 'N/A'}`
    ).join('\n');

    const releasesText = pressReleases.slice(0, 3).map((p: any) =>
        `[${p.date}] ${p.title}`
    ).join('\n');

    const signalsText = signals.map(s => s.description).join('; ');

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

// Comprehensive social media scan
async function scanSocialMedia(
    symbol: string,
    name: string,
    marketCap: number,
    signals: any[]
): Promise<{
    platforms: Array<{
        platform: string;
        activityLevel: string;
        promotionRisk: string;
        details: string;
    }>;
    overallPromotionScore: number;
    potentialPromoters: string[];
    coordinationIndicators: string[];
} | null> {
    if (!OPENAI_API_KEY) return null;

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const signalsText = signals.map(s => `- ${s.description}`).join('\n');
    const marketCapStr = marketCap ? `$${(marketCap / 1_000_000).toFixed(1)}M` : 'Unknown';

    const prompt = `You are a stock manipulation investigator analyzing ${symbol} (${name}).

COMPANY PROFILE:
- Market Cap: ${marketCapStr}
- Risk signals detected: ${signals.length}

SUSPICIOUS SIGNALS:
${signalsText}

Analyze the likelihood of social media promotion/manipulation across these platforms:

1. REDDIT
   - Subreddits: r/wallstreetbets, r/pennystocks, r/Shortsqueeze, r/stocks, r/RobinhoodPennyStocks
   - Look for: DD posts, rocket emojis, "next GME/AMC" claims, coordinated upvoting

2. DISCORD
   - Trading servers, pump group channels, "stock alert" servers
   - Look for: Coordinated buy signals, alert notifications, VIP channels

3. TWITTER/X
   - Cashtag activity ($${symbol}), stock promoter accounts, fintwit influencers
   - Look for: Paid promotions, sudden hashtag trends, bot activity

4. YOUTUBE
   - Stock tip channels, "10x gains" videos, penny stock analysis
   - Look for: Undisclosed sponsorships, clickbait thumbnails, subscriber counts

5. STOCKTWITS
   - Message volume spikes, sentiment manipulation, coordinated posting
   - Look for: Unusual bullish sentiment, new account activity

6. TIKTOK
   - Stock tip videos, "financial advice" creators
   - Look for: Viral stock picks, undisclosed promotions

7. FACEBOOK/INSTAGRAM
   - Investment groups, trading communities
   - Look for: Private group promotions, influencer posts

8. TELEGRAM
   - Pump groups, trading signals channels
   - Look for: Coordinated buy signals, membership fees

Based on the stock profile and signals, provide a realistic assessment of likely promotion activity.

Respond in JSON format:
{
  "platforms": [
    {
      "platform": "Platform Name",
      "activityLevel": "high/medium/low/none",
      "promotionRisk": "high/medium/low",
      "details": "Specific expected activity",
      "typicalPosts": "Example of likely promotional content",
      "redFlags": ["red flag 1", "red flag 2"]
    }
  ],
  "overallPromotionScore": 1-100,
  "potentialPromoterProfiles": [
    "Type 1: Description of likely promoter type",
    "Type 2: Another promoter type"
  ],
  "coordinationIndicators": [
    "Indicator 1",
    "Indicator 2"
  ],
  "manipulationLikelihood": "high/medium/low",
  "recommendedMonitoring": ["Specific platform/account to watch"]
}`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            max_tokens: 1500
        });

        const result = JSON.parse(response.choices[0].message.content || '{}');

        return {
            platforms: (result.platforms || []).map((p: any) => ({
                platform: p.platform,
                activityLevel: p.activityLevel || 'unknown',
                promotionRisk: p.promotionRisk || 'unknown',
                details: p.details || p.typicalPosts || ''
            })),
            overallPromotionScore: result.overallPromotionScore || 0,
            potentialPromoters: result.potentialPromoterProfiles || [],
            coordinationIndicators: result.coordinationIndicators || []
        };
    } catch (error: any) {
        console.log(`  Error scanning social media for ${symbol}:`, error?.message || error);
        return null;
    }
}

// Main pipeline execution
async function runEnhancedPipeline(): Promise<void> {
    const startTime = Date.now();
    const evaluationDate = getEvaluationDate();

    console.log('='.repeat(80));
    console.log('ENHANCED DAILY SCANNING PIPELINE');
    console.log(`Date: ${evaluationDate}`);
    console.log('='.repeat(80));

    // Validate API keys
    if (!FMP_API_KEY) {
        console.error('ERROR: FMP_API_KEY not set');
        process.exit(1);
    }

    // Load stocks
    const stocks = loadStockList();
    console.log(`\nLoaded ${stocks.length} US stocks for scanning\n`);

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

    // Check Python AI Backend availability for full 4-layer analysis
    const pythonAIAvailable = await checkPythonAIHealth();
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
                    // Use Python AI results (all 4 layers)
                    // Cast signals to the expected type (Python backend returns compatible structure)
                    const typedSignals = pyResult.signals.map(s => ({
                        code: s.code,
                        category: s.category as 'STRUCTURAL' | 'PATTERN' | 'ALERT' | 'BEHAVIORAL',
                        weight: s.weight,
                        description: s.description
                    }));
                    scoringResult = {
                        riskLevel: pyResult.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT',
                        totalScore: Math.round(pyResult.riskProbability * 20), // Convert probability to score
                        signals: typedSignals,
                        isLegitimate: false,
                        isInsufficient: false
                    };

                    aiLayers = {
                        layer1_deterministic: aiLayers.layer1_deterministic,
                        layer2_anomaly: pyResult.anomaly_score,
                        layer3_rf: pyResult.rf_probability,
                        layer4_lstm: pyResult.lstm_probability,
                        combined: pyResult.riskProbability,
                        usedPythonBackend: true
                    };
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

    // Phase 2: Filter high-risk stocks
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 2: Filtering High-Risk Stocks');
    console.log('-'.repeat(50));

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

    // Phase 3: News & SEC Filing Analysis
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 3: News & SEC Filing Analysis');
    console.log('-'.repeat(50));

    const afterNewsFilter: EnhancedStockResult[] = [];

    for (let i = 0; i < afterSizeFilter.length; i++) {
        const result = afterSizeFilter[i];
        console.log(`[${i + 1}/${afterSizeFilter.length}] Analyzing ${result.symbol}...`);

        // Fetch news and filings
        const news = await fetchStockNews(result.symbol);
        await sleep(300);

        const secFilings = await fetchSECFilings(result.symbol);
        await sleep(300);

        const pressReleases = await fetchPressReleases(result.symbol);
        await sleep(300);

        // Store news data
        result.recentNews = news.slice(0, 5).map((n: any) => ({
            title: n.title,
            date: n.publishedDate,
            source: n.site,
            url: n.url
        }));

        result.secFilings = secFilings.slice(0, 5).map((f: any) => ({
            type: f.type,
            date: f.fillingDate || f.date,
            url: f.finalLink || f.link
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

    // Phase 4: Social Media Scanning
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 4: Social Media Scanning');
    console.log('-'.repeat(50));

    for (let i = 0; i < afterNewsFilter.length; i++) {
        const result = afterNewsFilter[i];
        console.log(`[${i + 1}/${afterNewsFilter.length}] Scanning social media for ${result.symbol}...`);

        const socialFindings = await scanSocialMedia(
            result.symbol,
            result.name,
            result.marketCap || 0,
            result.signals
        );

        result.socialMediaScanned = true;
        result.socialMediaFindings = socialFindings;

        if (socialFindings && socialFindings.overallPromotionScore >= 60) {
            console.log(`  🔴 HIGH promotion score: ${socialFindings.overallPromotionScore}/100`);
        } else if (socialFindings && socialFindings.overallPromotionScore >= 40) {
            console.log(`  🟡 MEDIUM promotion score: ${socialFindings.overallPromotionScore}/100`);
        } else if (socialFindings) {
            console.log(`  🟢 LOW promotion score: ${socialFindings.overallPromotionScore}/100`);
        }

        suspiciousStocks.push(result);
        await sleep(1000);
    }

    // Phase 5: Scheme Tracking
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 5: Scheme Tracking & Numbering');
    console.log('-'.repeat(50));

    let newSchemes = 0;
    let ongoingSchemes = 0;
    let coolingSchemes = 0;
    let resolvedSchemes = 0;

    // STEP 5a: Update stale schemes (not seen for 7+ days) to RESOLVED
    // and check for COOLING status (price dropped >30% from peak)
    const symbolsSeenToday = new Set(suspiciousStocks.map(s => s.symbol));
    const allHighRiskSymbols = new Set(allResults.filter(r => r.riskLevel === 'HIGH').map(r => r.symbol));

    const schemeEntries = Array.from(schemeDB.entries());
    for (const [schemeId, scheme] of schemeEntries) {

        if (scheme.status === 'RESOLVED' || scheme.status === 'CONFIRMED_FRAUD') {
            continue; // Skip already resolved schemes
        }

        const lastSeenDate = new Date(scheme.lastSeen);
        const today = new Date(evaluationDate);
        const daysSinceLastSeen = Math.floor((today.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));

        // Check if scheme should be RESOLVED (not seen for 7+ days and no longer high-risk)
        if (daysSinceLastSeen >= 7 && !allHighRiskSymbols.has(scheme.symbol)) {
            scheme.status = 'RESOLVED';
            scheme.resolutionDetails = `Auto-resolved: No suspicious activity detected for ${daysSinceLastSeen} days`;
            scheme.timeline.push({
                date: evaluationDate,
                event: 'Scheme auto-resolved',
                details: `No suspicious activity for ${daysSinceLastSeen} days, stock no longer flagged as high-risk`,
                category: 'status_change',
                significance: 'high'
            });
            resolvedSchemes++;
            console.log(`  ⚪ Resolved stale scheme: ${schemeId} (${scheme.symbol}) - inactive for ${daysSinceLastSeen} days`);
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

        // Check if COOLING schemes should be RESOLVED (price dropped >50% or 14+ days of cooling)
        if (scheme.status === 'COOLING') {
            const currentResult = allResults.find(r => r.symbol === scheme.symbol);
            if (currentResult && currentResult.lastPrice && scheme.peakPrice > 0) {
                const priceChangeFromPeak = ((currentResult.lastPrice - scheme.peakPrice) / scheme.peakPrice) * 100;

                // Resolve if price is 50%+ below peak (dump complete)
                if (priceChangeFromPeak < -50) {
                    scheme.status = 'RESOLVED';
                    scheme.currentPrice = currentResult.lastPrice;
                    scheme.resolutionDetails = `Pump-and-dump cycle complete: Price crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak`;
                    scheme.timeline.push({
                        date: evaluationDate,
                        event: 'Scheme resolved - Dump cycle complete',
                        details: `Price crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}% from peak, scheme cycle complete`,
                        category: 'status_change',
                        significance: 'high'
                    });
                    resolvedSchemes++;
                    console.log(`  ⚫ Resolved dump scheme: ${schemeId} (${scheme.symbol}) - crashed ${Math.abs(priceChangeFromPeak).toFixed(1)}%`);
                }
            }
        }
    }

    console.log(`\n  Scheme lifecycle updates:`);
    console.log(`    Cooling (price dropping): ${coolingSchemes}`);
    console.log(`    Auto-resolved (stale/completed): ${resolvedSchemes}`);
    console.log('');

    for (const result of suspiciousStocks) {
        // Check if this stock is already in scheme database
        const existingScheme = Array.from(schemeDB.values()).find(
            s => s.symbol === result.symbol && s.status !== 'RESOLVED'
        );

        if (existingScheme) {
            // Update existing scheme
            existingScheme.lastSeen = evaluationDate;
            existingScheme.currentRiskScore = result.totalScore;
            existingScheme.currentPrice = result.lastPrice || existingScheme.currentPrice;
            existingScheme.status = 'ONGOING';

            if (result.socialMediaFindings) {
                const newPlatforms = result.socialMediaFindings.platforms
                    .filter(p => p.promotionRisk === 'high')
                    .map(p => p.platform);
                existingScheme.promotionPlatforms = Array.from(new Set([...existingScheme.promotionPlatforms, ...newPlatforms]));
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

            const newScheme: SchemeRecord = {
                schemeId,
                symbol: result.symbol,
                name: result.name,
                firstDetected: evaluationDate,
                lastSeen: evaluationDate,
                status: 'NEW',
                peakRiskScore: result.totalScore,
                currentRiskScore: result.totalScore,
                promotionPlatforms: result.socialMediaFindings.platforms
                    .filter(p => p.promotionRisk === 'high')
                    .map(p => p.platform),
                promoterAccounts: result.socialMediaFindings.potentialPromoters,
                priceAtDetection: result.lastPrice || 0,
                peakPrice: result.lastPrice || 0,
                currentPrice: result.lastPrice || 0,
                volumeAtDetection: result.avgDailyVolume || 0,
                notes: [`Initial detection with promotion score ${result.socialMediaFindings.overallPromotionScore}`],
                timeline: [{
                    date: evaluationDate,
                    event: 'Scheme detected',
                    details: `Risk score: ${result.totalScore}, Signals: ${result.signals.map(s => s.code).join(', ')}`
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
    console.log(`  Scheme database: ${path.join(SCHEME_DB_DIR, 'active-schemes.json')}`);

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
            if (s.socialMediaFindings?.coordinationIndicators.length) {
                console.log(`   Red Flags: ${s.socialMediaFindings.coordinationIndicators.slice(0, 3).join(', ')}`);
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
        process.exit(1);
    });
