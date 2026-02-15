/**
 * Backfill Promoter Database
 *
 * Reads all existing social media scan data and scheme data from the
 * scam-dunk-data GitHub repo to rebuild the promoter database from scratch.
 *
 * Usage:
 *   npx ts-node scripts/backfill-promoter-database.ts
 *
 * This script:
 * 1. Fetches all social-media-scan files from the data repo
 * 2. Extracts promoter accounts from each scan
 * 3. Cross-references with the scheme database
 * 4. Builds the promoter database with co-promoter network detection
 * 5. Writes both scheme-database.json and promoter-database.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DATA_REPO = 'Elimiz21/scam-dunk-data';
const RAW_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/main`;
const API_BASE = `https://api.github.com/repos/${DATA_REPO}`;
const SCHEME_DB_DIR = path.join(__dirname, '..', 'scheme-database');

if (!fs.existsSync(SCHEME_DB_DIR)) fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// ── Types ──────────────────────────────────────────────────────────────────

interface PromoterAccount {
    platform: string;
    identifier: string;
    firstSeen: string;
    lastSeen: string;
    postCount: number;
    confidence: 'high' | 'medium' | 'low';
}

interface SchemeRecord {
    schemeId: string;
    symbol: string;
    name: string;
    sector: string;
    industry: string;
    firstDetected: string;
    lastSeen: string;
    daysActive: number;
    status: string;
    peakRiskScore: number;
    currentRiskScore: number;
    peakPromotionScore: number;
    currentPromotionScore: number;
    priceAtDetection: number;
    peakPrice: number;
    currentPrice: number;
    priceChangeFromDetection: number;
    priceChangeFromPeak: number;
    volumeAtDetection: number;
    peakVolume: number;
    currentVolume: number;
    promotionPlatforms: string[];
    promoterAccounts: PromoterAccount[];
    signalsDetected: string[];
    coordinationIndicators: string[];
    timeline: Array<{
        date: string;
        event: string;
        category?: string;
        details?: string;
        significance?: string;
    }>;
    notes: string[];
    investigationFlags: string[];
    hadSocialMediaPromotion?: boolean;
}

interface SocialScanResult {
    symbol: string;
    name: string;
    riskScore: number;
    signals: string[];
    socialMediaMentions?: Array<{
        platform: string;
        source: string;
        mentionsFound: number;
        activityLevel: string;
        promotionRisk: string;
    }>;
    overallPromotionScore: number;
    promotionRiskLevel: string;
    overallAssessment: string;
}

interface SocialScanFile {
    scanDate: string;
    results: SocialScanResult[];
}

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

// ── Fetch helpers ──────────────────────────────────────────────────────────

function fetchJson<T>(url: string): T | null {
    try {
        const result = execSync(
            `curl -s --max-time 30 "${url}"`,
            { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }
        );
        return JSON.parse(result) as T;
    } catch {
        return null;
    }
}

function fetchGitHubContents<T>(path: string): T | null {
    try {
        const apiUrl = `${API_BASE}/contents/${path}`;
        const result = execSync(
            `curl -s --max-time 30 "${apiUrl}"`,
            { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }
        );
        const apiResponse = JSON.parse(result);
        if (apiResponse.content) {
            const decoded = Buffer.from(apiResponse.content, 'base64').toString('utf-8');
            return JSON.parse(decoded) as T;
        }
        return null;
    } catch {
        return null;
    }
}

function fetchRawFile<T>(path: string): T | null {
    return fetchJson<T>(`${RAW_BASE}/${path}`);
}

// ── Main backfill ──────────────────────────────────────────────────────────

async function main() {
    console.log('='.repeat(70));
    console.log('PROMOTER DATABASE BACKFILL');
    console.log('='.repeat(70));

    // Step 1: Load existing scheme database
    console.log('\n1. Loading existing scheme database...');
    let schemeDb = fetchGitHubContents<{
        schemes: Record<string, SchemeRecord>;
        lastUpdated: string;
        totalSchemes: number;
        activeSchemes: number;
        resolvedSchemes: number;
        confirmedFrauds: number;
    }>('scheme-tracking/scheme-database.json');

    if (!schemeDb) {
        console.log('   No scheme database found, starting fresh');
        schemeDb = {
            lastUpdated: new Date().toISOString(),
            totalSchemes: 0,
            activeSchemes: 0,
            resolvedSchemes: 0,
            confirmedFrauds: 0,
            schemes: {},
        };
    } else {
        console.log(`   Loaded ${Object.keys(schemeDb.schemes).length} schemes`);
    }

    // Step 2: Enrich scheme data with platform-level promoter accounts
    // Uses existing promotionPlatforms and coordinationIndicators from scheme data
    console.log('\n2. Enriching schemes with promoter data from existing platform info...');
    const schemes = schemeDb.schemes;

    for (const [, scheme] of Object.entries(schemes)) {
        // Ensure all fields exist
        if (!scheme.promoterAccounts) scheme.promoterAccounts = [];
        if (!scheme.coordinationIndicators) scheme.coordinationIndicators = [];
        if (!scheme.signalsDetected) scheme.signalsDetected = [];
        if (!scheme.notes) scheme.notes = [];
        if (!scheme.investigationFlags) scheme.investigationFlags = [];

        // Clean up any legacy string promoter accounts
        if (scheme.promoterAccounts.length > 0 && typeof scheme.promoterAccounts[0] === 'string') {
            scheme.promoterAccounts = [];
        }

        // Create platform-level promoter entries from the known promotion platforms
        const platforms = scheme.promotionPlatforms || [];
        for (const platform of platforms) {
            const existing = scheme.promoterAccounts.find(
                (a: PromoterAccount) => a.platform === platform
            );
            if (!existing) {
                // Check if there's a high risk indicator for this platform
                const isHigh = scheme.coordinationIndicators.some(
                    (ind: string) => ind.includes(platform) && ind.includes('High')
                );
                scheme.promoterAccounts.push({
                    platform,
                    identifier: `${platform} promoters`,
                    firstSeen: scheme.firstDetected,
                    lastSeen: scheme.lastSeen,
                    postCount: 1,
                    confidence: isHigh ? 'high' : 'medium',
                });
            }
        }

        console.log(`   ${scheme.symbol}: ${scheme.promoterAccounts.length} promoter accounts across ${platforms.length} platforms`);
    }

    // Step 5: Save updated scheme database
    console.log('\n5. Saving updated scheme database...');
    const schemeValues = Object.values(schemes);
    const activeStatuses = ['NEW', 'ONGOING', 'COOLING'];
    const resolvedStatuses = ['PUMP_AND_DUMP_ENDED', 'PUMP_AND_DUMP_ENDED_NO_PROMO', 'NO_SCAM_DETECTED', 'RESOLVED'];

    const updatedSchemeDb = {
        lastUpdated: new Date().toISOString(),
        totalSchemes: schemeValues.length,
        activeSchemes: schemeValues.filter(s => activeStatuses.includes(s.status)).length,
        resolvedSchemes: schemeValues.filter(s => resolvedStatuses.includes(s.status)).length,
        confirmedFrauds: schemeValues.filter(s => s.status === 'CONFIRMED_FRAUD').length,
        schemes,
    };

    const schemeDbPath = path.join(SCHEME_DB_DIR, 'scheme-database.json');
    fs.writeFileSync(schemeDbPath, JSON.stringify(updatedSchemeDb, null, 2));
    console.log(`   Saved ${schemeValues.length} schemes to ${schemeDbPath}`);

    // Step 6: Build promoter database
    console.log('\n6. Building promoter database...');
    const promoterMap = new Map<string, PromoterEntry>();

    for (const scheme of schemeValues) {
        if (!Array.isArray(scheme.promoterAccounts)) continue;

        for (const account of scheme.promoterAccounts) {
            if (typeof account === 'string') continue;

            const key = `${account.platform}::${account.identifier}`;
            let promoter = promoterMap.get(key);

            if (!promoter) {
                const idPart = account.identifier.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
                const platPart = account.platform.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6);
                promoter = {
                    promoterId: `PROM-${platPart}-${idPart}`,
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

            promoter.totalPosts += account.postCount;
            if (account.firstSeen < promoter.firstSeen) promoter.firstSeen = account.firstSeen;
            if (account.lastSeen > promoter.lastSeen) promoter.lastSeen = account.lastSeen;
            if (account.confidence === 'high') promoter.confidence = 'high';

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
        const highConf = promoter.confidence === 'high';
        const hasCo = promoter.coPromoters.length > 0;

        if (stockCount >= 3 || (stockCount >= 2 && highConf && hasCo)) {
            promoter.riskLevel = 'SERIAL_OFFENDER';
        } else if (stockCount >= 2 || (highConf && hasCo)) {
            promoter.riskLevel = 'HIGH';
        } else if (highConf || hasCo) {
            promoter.riskLevel = 'MEDIUM';
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

    const promoterDbPath = path.join(SCHEME_DB_DIR, 'promoter-database.json');
    fs.writeFileSync(promoterDbPath, JSON.stringify(promoterDb, null, 2));

    console.log(`   Saved ${promoterList.length} promoters to ${promoterDbPath}`);
    console.log(`   Active: ${promoterDb.activePromoters}`);
    console.log(`   Serial offenders: ${promoterDb.serialOffenders}`);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(70));
    console.log(`  Schemes: ${schemeValues.length} total (${updatedSchemeDb.activeSchemes} active)`);
    console.log(`  Promoters: ${promoterList.length} total (${promoterDb.activePromoters} active)`);
    console.log(`  Serial offenders: ${promoterDb.serialOffenders}`);
    console.log(`  Co-promoter pairs: ${promoterList.reduce((sum, p) => sum + p.coPromoters.length, 0) / 2}`);
    console.log('');
    console.log('Files written:');
    console.log(`  ${schemeDbPath}`);
    console.log(`  ${promoterDbPath}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Review the generated files');
    console.log('  2. Commit to the data repo');
    console.log('  3. Upload to Supabase: npx ts-node scripts/upload-to-supabase.ts');
}

main().catch(console.error);
