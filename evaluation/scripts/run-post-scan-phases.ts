/**
 * Post-Scan Processing Pipeline
 *
 * Runs phases 2-5 of the enhanced pipeline on EXISTING risk-scored data:
 * - Phase 2: Filter by market cap and volume
 * - Phase 3: News legitimacy analysis (OpenAI)
 * - Phase 4: Social media scanning
 * - Phase 5: Scheme tracking
 *
 * Usage:
 *   EVALUATION_DATE=2026-02-03 npx ts-node scripts/run-post-scan-phases.ts
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   - FMP_API_KEY (for news/filings)
 *   - OPENAI_API_KEY (for news analysis)
 *   - EVALUATION_DATE (defaults to today)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import * as fs from 'fs';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// Import social scanner
import { performRealSocialScan, ComprehensiveScanResult } from './real-social-scanner';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SCHEME_DB_DIR = path.join(__dirname, '..', 'scheme-database');

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(SCHEME_DB_DIR)) fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
// Note: Legacy v3 endpoints deprecated Aug 31, 2025 - now using stable API
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// Thresholds for filtering
const MARKET_CAP_THRESHOLD = 10_000_000_000; // $10B
const VOLUME_THRESHOLD = 10_000_000; // $10M daily volume

// Supabase setup
function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        throw new Error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    return createClient(url, key);
}

// Types
interface HighRiskStock {
    symbol: string;
    name: string;
    exchange: string;
    sector?: string;
    industry?: string;
    marketCap: number | null;
    lastPrice: number | null;
    avgDailyVolume?: number | null;
    avgDollarVolume?: number | null;
    riskLevel: string;
    totalScore: number;
    signals: Array<{ code: string; category: string; weight: number; description: string }>;
    evaluatedAt: string;
}

interface ProcessedStock extends HighRiskStock {
    isFiltered: boolean;
    filterReason: string | null;
    hasLegitimateNews: boolean;
    newsAnalysis: string | null;
    recentNews: Array<{ title: string; date: string; source: string; url: string }>;
    secFilings: Array<{ type: string; date: string; url: string }>;
    socialMediaScanned: boolean;
    socialMediaFindings?: ComprehensiveScanResult | null;
    schemeId: string | null;
    schemeStatus: string | null;
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

// Fetch HIGH risk stocks from Supabase database
async function fetchHighRiskStocksFromDB(date: string): Promise<HighRiskStock[]> {
    console.log(`Fetching HIGH risk stocks for ${date} from Supabase...`);

    const supabase = getSupabaseClient();

    // Query the risk_snapshots table for HIGH risk stocks on the given date
    const { data, error } = await supabase
        .from('risk_snapshots')
        .select('*')
        .eq('risk_level', 'HIGH')
        .gte('snapshot_date', `${date}T00:00:00`)
        .lt('snapshot_date', `${date}T23:59:59`)
        .order('total_score', { ascending: false });

    if (error) {
        console.error('Error fetching from Supabase:', error);
        throw error;
    }

    if (!data || data.length === 0) {
        console.log('No HIGH risk stocks found in database. Trying storage bucket...');
        return await fetchHighRiskStocksFromStorage(date);
    }

    console.log(`Found ${data.length} HIGH risk stocks in database`);

    // Map database fields to our interface
    return data.map((row: any) => ({
        symbol: row.symbol,
        name: row.company_name || row.symbol,
        exchange: row.exchange || 'Unknown',
        sector: row.sector,
        industry: row.industry,
        marketCap: row.market_cap,
        lastPrice: row.last_price,
        avgDailyVolume: row.avg_volume,
        avgDollarVolume: row.avg_volume && row.last_price ? row.avg_volume * row.last_price : null,
        riskLevel: row.risk_level,
        totalScore: row.total_score,
        signals: row.signals || [],
        evaluatedAt: row.snapshot_date
    }));
}

// Fallback: fetch from Supabase Storage
async function fetchHighRiskStocksFromStorage(date: string): Promise<HighRiskStock[]> {
    console.log(`Trying to fetch from Supabase Storage for ${date}...`);

    const supabase = getSupabaseClient();
    const fileName = `fmp-high-risk-${date}.json`;

    const { data, error } = await supabase.storage
        .from('evaluation-data')
        .download(fileName);

    if (error || !data) {
        // Try enhanced format
        const enhancedFileName = `enhanced-high-risk-${date}.json`;
        const { data: enhancedData, error: enhancedError } = await supabase.storage
            .from('evaluation-data')
            .download(enhancedFileName);

        if (enhancedError || !enhancedData) {
            throw new Error(`Could not find evaluation data for ${date} in storage`);
        }

        const text = await enhancedData.text();
        return JSON.parse(text);
    }

    const text = await data.text();
    return JSON.parse(text);
}

// FMP API functions (using stable API - v3 deprecated Aug 31, 2025)
async function fetchStockNews(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        const url = `${FMP_BASE_URL}/news/stock?symbols=${symbol}&limit=15&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const news = JSON.parse(response);
        return Array.isArray(news) ? news : [];
    } catch {
        return [];
    }
}

async function fetchSECFilings(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        // Get filings from last 90 days
        const toDate = new Date().toISOString().split('T')[0];
        const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const url = `${FMP_BASE_URL}/sec-filings-search/symbol?symbol=${symbol}&from=${fromDate}&to=${toDate}&limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const filings = JSON.parse(response);
        return Array.isArray(filings) ? filings : [];
    } catch {
        return [];
    }
}

async function fetchPressReleases(symbol: string): Promise<any[]> {
    if (!FMP_API_KEY) return [];

    try {
        const url = `${FMP_BASE_URL}/news/press-releases?symbols=${symbol}&limit=10&apikey=${FMP_API_KEY}`;
        const response = curlFetch(url);
        if (!response) return [];
        const releases = JSON.parse(response);
        return Array.isArray(releases) ? releases : [];
    } catch {
        return [];
    }
}

// Filter by market cap and volume
function shouldFilterBySize(stock: HighRiskStock): { filtered: boolean; reason: string | null } {
    if (stock.marketCap && stock.marketCap > MARKET_CAP_THRESHOLD) {
        return {
            filtered: true,
            reason: `Large market cap ($${(stock.marketCap / 1_000_000_000).toFixed(1)}B) - not susceptible to pump-and-dump`
        };
    }

    if (stock.avgDollarVolume && stock.avgDollarVolume > VOLUME_THRESHOLD) {
        return {
            filtered: true,
            reason: `High daily volume ($${(stock.avgDollarVolume / 1_000_000).toFixed(1)}M) - highly liquid, hard to manipulate`
        };
    }

    return { filtered: false, reason: null };
}

// News legitimacy analysis using OpenAI
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

    const safeNews = Array.isArray(news) ? news : [];
    const safeFilings = Array.isArray(secFilings) ? secFilings : [];
    const safeReleases = Array.isArray(pressReleases) ? pressReleases : [];
    const safeSignals = Array.isArray(signals) ? signals : [];

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
- Earnings announcements, FDA approvals, clinical trial results
- Major contracts, partnerships, M&A news
- Regulatory approvals, product launches, management changes
- Stock splits, buybacks, significant financing

NOT LEGITIMATE (still suspicious):
- Vague "investor awareness" campaigns
- Paid promotional articles
- Generic positive sentiment with no actual news

Respond in JSON format:
{
  "hasLegitimateNews": true/false,
  "explanation": "Brief explanation",
  "specificEvent": "The specific event, or null"
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

// Generate scheme ID
function generateSchemeId(symbol: string, date: string): string {
    const timestamp = Date.now().toString(36);
    return `SCHEME-${symbol}-${date.replace(/-/g, '')}-${timestamp}`.toUpperCase();
}

// Main processing function
async function runPostScanPhases(): Promise<void> {
    const startTime = Date.now();
    const evaluationDate = getEvaluationDate();

    console.log('='.repeat(80));
    console.log('POST-SCAN PROCESSING PIPELINE');
    console.log(`Date: ${evaluationDate}`);
    console.log('='.repeat(80));

    // Check required env vars
    console.log('\nEnvironment check:');
    console.log(`  FMP_API_KEY: ${FMP_API_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`  OPENAI_API_KEY: ${OPENAI_API_KEY ? '✓ Set' : '✗ Missing'}`);
    console.log(`  Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing'}`);

    if (!FMP_API_KEY) {
        console.error('\nERROR: FMP_API_KEY is required for news/filings fetch');
        process.exit(1);
    }

    // Phase 1: Load HIGH risk stocks
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 1: Loading HIGH Risk Stocks');
    console.log('-'.repeat(50));

    const highRiskStocks = await fetchHighRiskStocksFromDB(evaluationDate);
    console.log(`Loaded ${highRiskStocks.length} HIGH risk stocks`);

    if (highRiskStocks.length === 0) {
        console.log('No HIGH risk stocks to process. Exiting.');
        process.exit(0);
    }

    // Initialize processed results
    const processedStocks: ProcessedStock[] = [];
    const suspiciousStocks: ProcessedStock[] = [];

    // Counters
    let filteredByMarketCap = 0;
    let filteredByVolume = 0;
    let filteredByNews = 0;

    // Phase 2: Filter by market cap and volume
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 2: Filtering by Market Cap & Volume');
    console.log('-'.repeat(50));

    const afterSizeFilter: ProcessedStock[] = [];

    for (const stock of highRiskStocks) {
        const processed: ProcessedStock = {
            ...stock,
            isFiltered: false,
            filterReason: null,
            hasLegitimateNews: false,
            newsAnalysis: null,
            recentNews: [],
            secFilings: [],
            socialMediaScanned: false,
            socialMediaFindings: null,
            schemeId: null,
            schemeStatus: null
        };

        const sizeFilter = shouldFilterBySize(stock);

        if (sizeFilter.filtered) {
            processed.isFiltered = true;
            processed.filterReason = sizeFilter.reason;

            if (sizeFilter.reason?.includes('market cap')) {
                filteredByMarketCap++;
            } else {
                filteredByVolume++;
            }
        } else {
            afterSizeFilter.push(processed);
        }

        processedStocks.push(processed);
    }

    console.log(`  Filtered by market cap (>$10B): ${filteredByMarketCap}`);
    console.log(`  Filtered by volume (>$10M): ${filteredByVolume}`);
    console.log(`  Remaining for news check: ${afterSizeFilter.length}`);

    // Phase 3: News & SEC Filing Analysis
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 3: News & SEC Filing Analysis');
    console.log('-'.repeat(50));

    const afterNewsFilter: ProcessedStock[] = [];

    for (let i = 0; i < afterSizeFilter.length; i++) {
        const stock = afterSizeFilter[i];
        console.log(`[${i + 1}/${afterSizeFilter.length}] Analyzing ${stock.symbol}...`);

        // Fetch news and filings
        const news = await fetchStockNews(stock.symbol);
        await sleep(300);

        const secFilings = await fetchSECFilings(stock.symbol);
        await sleep(300);

        const pressReleases = await fetchPressReleases(stock.symbol);
        await sleep(300);

        // Store news data
        stock.recentNews = news.slice(0, 5).map((n: any) => ({
            title: n?.title || '',
            date: n?.publishedDate || '',
            source: n?.site || '',
            url: n?.url || ''
        }));

        stock.secFilings = secFilings.slice(0, 5).map((f: any) => ({
            type: f?.type || '',
            date: f?.fillingDate || f?.date || '',
            url: f?.finalLink || f?.link || ''
        }));

        // Analyze legitimacy
        const newsAnalysis = await analyzeNewsLegitimacy(
            stock.symbol,
            stock.name,
            stock.signals,
            news,
            secFilings,
            pressReleases
        );

        stock.hasLegitimateNews = newsAnalysis.hasLegitimateNews;
        stock.newsAnalysis = newsAnalysis.analysis;

        if (newsAnalysis.hasLegitimateNews) {
            stock.isFiltered = true;
            stock.filterReason = `Legitimate news: ${newsAnalysis.analysis}`;
            filteredByNews++;
            console.log(`  ✓ Filtered - Legitimate news found`);
        } else {
            afterNewsFilter.push(stock);
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
        const stock = afterNewsFilter[i];
        console.log(`[${i + 1}/${afterNewsFilter.length}] Scanning social media for ${stock.symbol}...`);

        try {
            const socialFindings = await performRealSocialScan(
                stock.symbol,
                stock.name,
                stock.marketCap || 0
            );

            stock.socialMediaScanned = true;
            stock.socialMediaFindings = socialFindings;

            if (socialFindings && socialFindings.overallPromotionScore >= 60) {
                console.log(`  🔴 HIGH promotion score: ${socialFindings.overallPromotionScore}/100`);
            } else if (socialFindings && socialFindings.overallPromotionScore >= 40) {
                console.log(`  🟡 MEDIUM promotion score: ${socialFindings.overallPromotionScore}/100`);
            } else if (socialFindings) {
                console.log(`  🟢 LOW promotion score: ${socialFindings.overallPromotionScore}/100`);
            }
        } catch (error: any) {
            console.log(`  ⚠ Error scanning social media: ${error?.message || error}`);
            stock.socialMediaScanned = true;
            stock.socialMediaFindings = null;
        }

        suspiciousStocks.push(stock);
        await sleep(1000);
    }

    // Phase 5: Assign Scheme IDs
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 5: Scheme Assignment');
    console.log('-'.repeat(50));

    let newSchemes = 0;

    for (const stock of suspiciousStocks) {
        if (stock.socialMediaFindings && stock.socialMediaFindings.overallPromotionScore >= 50) {
            stock.schemeId = generateSchemeId(stock.symbol, evaluationDate);
            stock.schemeStatus = 'NEW';
            newSchemes++;
            console.log(`  🆕 New scheme: ${stock.schemeId} (${stock.symbol})`);
        }
    }

    console.log(`\n  New schemes detected: ${newSchemes}`);
    console.log(`  Total suspicious stocks: ${suspiciousStocks.length}`);

    // Save results
    const endTime = Date.now();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    const report = {
        date: evaluationDate,
        processingType: 'post-scan',
        totalHighRiskInput: highRiskStocks.length,
        filteredByMarketCap,
        filteredByVolume,
        filteredByNews,
        remainingSuspicious: suspiciousStocks.length,
        newSchemes,
        processingTimeMinutes: durationMinutes
    };

    // Save files
    const suspiciousPath = path.join(RESULTS_DIR, `suspicious-stocks-${evaluationDate}.json`);
    fs.writeFileSync(suspiciousPath, JSON.stringify(suspiciousStocks, null, 2));

    const reportPath = path.join(RESULTS_DIR, `post-scan-report-${evaluationDate}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const allProcessedPath = path.join(RESULTS_DIR, `filtered-high-risk-${evaluationDate}.json`);
    fs.writeFileSync(allProcessedPath, JSON.stringify(processedStocks, null, 2));

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('PROCESSING COMPLETE');
    console.log('='.repeat(80));
    console.log(`\nSummary:`);
    console.log(`  Input HIGH risk stocks: ${highRiskStocks.length}`);
    console.log(`  Filtered by market cap: ${filteredByMarketCap}`);
    console.log(`  Filtered by volume: ${filteredByVolume}`);
    console.log(`  Filtered by news: ${filteredByNews}`);
    console.log(`  Remaining suspicious: ${suspiciousStocks.length}`);
    console.log(`  New schemes: ${newSchemes}`);
    console.log(`  Duration: ${durationMinutes} minutes`);
    console.log(`\nOutput Files:`);
    console.log(`  Suspicious stocks: ${suspiciousPath}`);
    console.log(`  Processing report: ${reportPath}`);
    console.log(`  All processed: ${allProcessedPath}`);

    // Print top suspicious stocks
    if (suspiciousStocks.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('TOP SUSPICIOUS STOCKS');
        console.log('='.repeat(80));

        const sorted = [...suspiciousStocks].sort((a, b) => {
            const aScore = (a.socialMediaFindings?.overallPromotionScore || 0) + a.totalScore;
            const bScore = (b.socialMediaFindings?.overallPromotionScore || 0) + b.totalScore;
            return bScore - aScore;
        });

        sorted.slice(0, 10).forEach((s, i) => {
            const promoScore = s.socialMediaFindings?.overallPromotionScore || 0;
            console.log(`\n${i + 1}. ${s.symbol} (${s.name})`);
            console.log(`   Risk Score: ${s.totalScore} | Promotion Score: ${promoScore}`);
            console.log(`   Signals: ${s.signals.map(sig => sig.code).join(', ')}`);
            if (s.schemeId) {
                console.log(`   Scheme ID: ${s.schemeId}`);
            }
        });
    }
}

// Run
runPostScanPhases()
    .then(() => {
        console.log('\n✅ Post-scan processing completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Processing failed:', error);
        process.exit(1);
    });
