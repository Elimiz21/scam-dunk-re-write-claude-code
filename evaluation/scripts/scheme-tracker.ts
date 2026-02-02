/**
 * Scheme Tracking Module
 * 
 * This module manages the ongoing tracking of potential pump-and-dump schemes.
 * It maintains a database of detected schemes, tracks their lifecycle,
 * and generates reports for monitoring and investigation.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEME_DB_DIR = path.join(__dirname, '..', 'scheme-database');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Ensure directories exist
if (!fs.existsSync(SCHEME_DB_DIR)) fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// Types
export interface SchemeRecord {
    schemeId: string;
    symbol: string;
    name: string;
    sector: string;
    industry: string;
    firstDetected: string;
    lastSeen: string;
    daysActive: number;
    status: 'NEW' | 'ONGOING' | 'COOLING' | 'RESOLVED' | 'CONFIRMED_FRAUD';

    // Risk metrics
    peakRiskScore: number;
    currentRiskScore: number;
    peakPromotionScore: number;
    currentPromotionScore: number;

    // Price tracking
    priceAtDetection: number;
    peakPrice: number;
    currentPrice: number;
    priceChangeFromDetection: number;
    priceChangeFromPeak: number;

    // Volume tracking
    volumeAtDetection: number;
    peakVolume: number;
    currentVolume: number;

    // Promotion tracking
    promotionPlatforms: string[];
    promoterAccounts: Array<{
        platform: string;
        identifier: string;
        firstSeen: string;
        lastSeen: string;
        postCount: number;
        confidence: 'high' | 'medium' | 'low';
    }>;

    // Evidence
    signalsDetected: string[];
    coordinationIndicators: string[];

    // Timeline
    timeline: Array<{
        date: string;
        event: string;
        category: 'detection' | 'price_movement' | 'promotion' | 'volume' | 'status_change' | 'note';
        details: string;
        significance: 'high' | 'medium' | 'low';
    }>;

    // Notes and flags
    notes: string[];
    investigationFlags: string[];
    resolutionDetails?: string;
}

export interface SchemeDatabase {
    lastUpdated: string;
    totalSchemes: number;
    activeSchemes: number;
    resolvedSchemes: number;
    confirmedFrauds: number;
    schemes: Record<string, SchemeRecord>;
}

export interface SchemeSummary {
    schemeId: string;
    symbol: string;
    name: string;
    status: string;
    daysActive: number;
    currentRiskScore: number;
    currentPromotionScore: number;
    priceChangeFromDetection: number;
    priceChangeFromPeak: number;
    promotionPlatforms: string[];
    urgency: 'critical' | 'high' | 'medium' | 'low';
}

// Load scheme database
export function loadSchemeDatabase(): SchemeDatabase {
    const dbPath = path.join(SCHEME_DB_DIR, 'scheme-database.json');

    if (!fs.existsSync(dbPath)) {
        return {
            lastUpdated: new Date().toISOString(),
            totalSchemes: 0,
            activeSchemes: 0,
            resolvedSchemes: 0,
            confirmedFrauds: 0,
            schemes: {}
        };
    }

    try {
        return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch {
        return {
            lastUpdated: new Date().toISOString(),
            totalSchemes: 0,
            activeSchemes: 0,
            resolvedSchemes: 0,
            confirmedFrauds: 0,
            schemes: {}
        };
    }
}

// Save scheme database
export function saveSchemeDatabase(db: SchemeDatabase): void {
    db.lastUpdated = new Date().toISOString();

    // Update counts
    const schemes = Object.values(db.schemes);
    db.totalSchemes = schemes.length;
    db.activeSchemes = schemes.filter(s => ['NEW', 'ONGOING'].includes(s.status)).length;
    db.resolvedSchemes = schemes.filter(s => s.status === 'RESOLVED').length;
    db.confirmedFrauds = schemes.filter(s => s.status === 'CONFIRMED_FRAUD').length;

    const dbPath = path.join(SCHEME_DB_DIR, 'scheme-database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Generate unique scheme ID
export function generateSchemeId(symbol: string, date: string): string {
    const dateCode = date.replace(/-/g, '');
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SCH-${symbol}-${dateCode}-${randomCode}`;
}

// Create new scheme record
export function createSchemeRecord(
    symbol: string,
    name: string,
    data: {
        sector?: string;
        industry?: string;
        riskScore: number;
        promotionScore: number;
        price: number;
        volume: number;
        promotionPlatforms: string[];
        signals: string[];
        coordinationIndicators: string[];
        promoterAccounts?: Array<{
            platform: string;
            identifier: string;
            confidence: 'high' | 'medium' | 'low';
        }>;
    }
): SchemeRecord {
    const today = new Date().toISOString().split('T')[0];
    const schemeId = generateSchemeId(symbol, today);

    return {
        schemeId,
        symbol,
        name,
        sector: data.sector || 'Unknown',
        industry: data.industry || 'Unknown',
        firstDetected: today,
        lastSeen: today,
        daysActive: 1,
        status: 'NEW',

        peakRiskScore: data.riskScore,
        currentRiskScore: data.riskScore,
        peakPromotionScore: data.promotionScore,
        currentPromotionScore: data.promotionScore,

        priceAtDetection: data.price,
        peakPrice: data.price,
        currentPrice: data.price,
        priceChangeFromDetection: 0,
        priceChangeFromPeak: 0,

        volumeAtDetection: data.volume,
        peakVolume: data.volume,
        currentVolume: data.volume,

        promotionPlatforms: data.promotionPlatforms,
        promoterAccounts: (data.promoterAccounts || []).map(p => ({
            ...p,
            firstSeen: today,
            lastSeen: today,
            postCount: 1
        })),

        signalsDetected: data.signals,
        coordinationIndicators: data.coordinationIndicators,

        timeline: [{
            date: today,
            event: 'Scheme detected',
            category: 'detection',
            details: `Initial detection with risk score ${data.riskScore} and promotion score ${data.promotionScore}`,
            significance: 'high'
        }],

        notes: [],
        investigationFlags: []
    };
}

// Update existing scheme record
export function updateSchemeRecord(
    scheme: SchemeRecord,
    data: {
        riskScore: number;
        promotionScore: number;
        price: number;
        volume: number;
        newPlatforms?: string[];
        newSignals?: string[];
        newCoordinationIndicators?: string[];
        newPromoterAccounts?: Array<{
            platform: string;
            identifier: string;
            confidence: 'high' | 'medium' | 'low';
        }>;
    }
): SchemeRecord {
    const today = new Date().toISOString().split('T')[0];
    const firstDetectedDate = new Date(scheme.firstDetected);
    const todayDate = new Date(today);
    const daysActive = Math.ceil((todayDate.getTime() - firstDetectedDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Update basic info
    scheme.lastSeen = today;
    scheme.daysActive = daysActive;
    scheme.currentRiskScore = data.riskScore;
    scheme.currentPromotionScore = data.promotionScore;
    scheme.currentPrice = data.price;
    scheme.currentVolume = data.volume;

    // Update peaks
    if (data.riskScore > scheme.peakRiskScore) {
        scheme.peakRiskScore = data.riskScore;
        scheme.timeline.push({
            date: today,
            event: 'New peak risk score',
            category: 'detection',
            details: `Risk score increased to ${data.riskScore}`,
            significance: 'high'
        });
    }

    if (data.promotionScore > scheme.peakPromotionScore) {
        scheme.peakPromotionScore = data.promotionScore;
        scheme.timeline.push({
            date: today,
            event: 'New peak promotion score',
            category: 'promotion',
            details: `Promotion score increased to ${data.promotionScore}`,
            significance: 'high'
        });
    }

    if (data.price > scheme.peakPrice) {
        const priceIncrease = ((data.price - scheme.peakPrice) / scheme.peakPrice * 100).toFixed(1);
        scheme.peakPrice = data.price;
        scheme.timeline.push({
            date: today,
            event: 'New price high',
            category: 'price_movement',
            details: `Price increased ${priceIncrease}% to $${data.price.toFixed(2)}`,
            significance: 'high'
        });
    }

    if (data.volume > scheme.peakVolume) {
        scheme.peakVolume = data.volume;
        scheme.timeline.push({
            date: today,
            event: 'New volume high',
            category: 'volume',
            details: `Volume spike to ${data.volume.toLocaleString()}`,
            significance: 'medium'
        });
    }

    // Calculate price changes
    scheme.priceChangeFromDetection = ((data.price - scheme.priceAtDetection) / scheme.priceAtDetection) * 100;
    scheme.priceChangeFromPeak = ((data.price - scheme.peakPrice) / scheme.peakPrice) * 100;

    // Add new platforms
    if (data.newPlatforms) {
        for (const platform of data.newPlatforms) {
            if (!scheme.promotionPlatforms.includes(platform)) {
                scheme.promotionPlatforms.push(platform);
                scheme.timeline.push({
                    date: today,
                    event: 'New promotion platform detected',
                    category: 'promotion',
                    details: `Promotion activity detected on ${platform}`,
                    significance: 'medium'
                });
            }
        }
    }

    // Add new signals
    if (data.newSignals) {
        for (const signal of data.newSignals) {
            if (!scheme.signalsDetected.includes(signal)) {
                scheme.signalsDetected.push(signal);
            }
        }
    }

    // Add new coordination indicators
    if (data.newCoordinationIndicators) {
        for (const indicator of data.newCoordinationIndicators) {
            if (!scheme.coordinationIndicators.includes(indicator)) {
                scheme.coordinationIndicators.push(indicator);
            }
        }
    }

    // Add new promoter accounts
    if (data.newPromoterAccounts) {
        for (const account of data.newPromoterAccounts) {
            const existing = scheme.promoterAccounts.find(
                p => p.platform === account.platform && p.identifier === account.identifier
            );

            if (existing) {
                existing.lastSeen = today;
                existing.postCount++;
                if (account.confidence === 'high' && existing.confidence !== 'high') {
                    existing.confidence = account.confidence;
                }
            } else {
                scheme.promoterAccounts.push({
                    ...account,
                    firstSeen: today,
                    lastSeen: today,
                    postCount: 1
                });
                scheme.timeline.push({
                    date: today,
                    event: 'New promoter account identified',
                    category: 'promotion',
                    details: `${account.platform}: ${account.identifier} (confidence: ${account.confidence})`,
                    significance: 'high'
                });
            }
        }
    }

    // Update status based on activity
    if (scheme.status === 'NEW' && daysActive >= 2) {
        scheme.status = 'ONGOING';
        scheme.timeline.push({
            date: today,
            event: 'Status changed to ONGOING',
            category: 'status_change',
            details: 'Scheme has been active for multiple days',
            significance: 'medium'
        });
    }

    // Check for cooling (significant price drop from peak)
    if (scheme.priceChangeFromPeak < -30 && scheme.status === 'ONGOING') {
        scheme.status = 'COOLING';
        scheme.timeline.push({
            date: today,
            event: 'Status changed to COOLING',
            category: 'status_change',
            details: `Price has dropped ${Math.abs(scheme.priceChangeFromPeak).toFixed(1)}% from peak - possible dump phase`,
            significance: 'high'
        });
    }

    return scheme;
}

// Mark scheme as resolved
export function resolveScheme(scheme: SchemeRecord, reason: string): SchemeRecord {
    const today = new Date().toISOString().split('T')[0];
    scheme.status = 'RESOLVED';
    scheme.resolutionDetails = reason;

    scheme.timeline.push({
        date: today,
        event: 'Scheme resolved',
        category: 'status_change',
        details: reason,
        significance: 'high'
    });

    return scheme;
}

// Mark scheme as confirmed fraud
export function confirmFraud(scheme: SchemeRecord, evidence: string): SchemeRecord {
    const today = new Date().toISOString().split('T')[0];
    scheme.status = 'CONFIRMED_FRAUD';
    scheme.investigationFlags.push(evidence);

    scheme.timeline.push({
        date: today,
        event: 'Confirmed as fraud',
        category: 'status_change',
        details: evidence,
        significance: 'high'
    });

    return scheme;
}

// Get scheme urgency level
export function getSchemeUrgency(scheme: SchemeRecord): 'critical' | 'high' | 'medium' | 'low' {
    // Critical: Active pump with high promotion and rising price
    if (
        scheme.status === 'ONGOING' &&
        scheme.currentPromotionScore >= 70 &&
        scheme.priceChangeFromDetection > 20 &&
        scheme.currentRiskScore >= 10
    ) {
        return 'critical';
    }

    // High: Active scheme with significant activity
    if (
        ['NEW', 'ONGOING'].includes(scheme.status) &&
        (scheme.currentPromotionScore >= 60 || scheme.currentRiskScore >= 8) &&
        scheme.promoterAccounts.length > 0
    ) {
        return 'high';
    }

    // Medium: Early stage or cooling schemes
    if (
        ['NEW', 'ONGOING', 'COOLING'].includes(scheme.status) &&
        (scheme.currentPromotionScore >= 40 || scheme.currentRiskScore >= 5)
    ) {
        return 'medium';
    }

    return 'low';
}

// Generate scheme summaries for dashboard
export function getSchemeSummaries(db: SchemeDatabase): SchemeSummary[] {
    return Object.values(db.schemes)
        .filter(s => ['NEW', 'ONGOING', 'COOLING', 'CONFIRMED_FRAUD'].includes(s.status))
        .map(s => ({
            schemeId: s.schemeId,
            symbol: s.symbol,
            name: s.name,
            status: s.status,
            daysActive: s.daysActive,
            currentRiskScore: s.currentRiskScore,
            currentPromotionScore: s.currentPromotionScore,
            priceChangeFromDetection: s.priceChangeFromDetection,
            priceChangeFromPeak: s.priceChangeFromPeak,
            promotionPlatforms: s.promotionPlatforms,
            urgency: getSchemeUrgency(s)
        }))
        .sort((a, b) => {
            const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        });
}

// Generate daily scheme report
export function generateDailySchemeReport(db: SchemeDatabase, date: string): string {
    const summaries = getSchemeSummaries(db);
    const critical = summaries.filter(s => s.urgency === 'critical');
    const high = summaries.filter(s => s.urgency === 'high');
    const medium = summaries.filter(s => s.urgency === 'medium');

    let report = `# Daily Scheme Tracking Report\n`;
    report += `Date: ${date}\n\n`;

    report += `## Summary\n`;
    report += `- Total Active Schemes: ${db.activeSchemes}\n`;
    report += `- Critical Priority: ${critical.length}\n`;
    report += `- High Priority: ${high.length}\n`;
    report += `- Medium Priority: ${medium.length}\n`;
    report += `- Confirmed Frauds (Historical): ${db.confirmedFrauds}\n\n`;

    if (critical.length > 0) {
        report += `## 🔴 CRITICAL - Immediate Attention Required\n\n`;
        for (const s of critical) {
            report += `### ${s.symbol} - ${s.name}\n`;
            report += `- Scheme ID: ${s.schemeId}\n`;
            report += `- Days Active: ${s.daysActive}\n`;
            report += `- Risk Score: ${s.currentRiskScore} | Promotion Score: ${s.currentPromotionScore}\n`;
            report += `- Price Change: ${s.priceChangeFromDetection.toFixed(1)}% from detection, ${s.priceChangeFromPeak.toFixed(1)}% from peak\n`;
            report += `- Active Platforms: ${s.promotionPlatforms.join(', ')}\n\n`;
        }
    }

    if (high.length > 0) {
        report += `## 🟡 HIGH PRIORITY\n\n`;
        for (const s of high) {
            report += `### ${s.symbol} - ${s.name}\n`;
            report += `- Scheme ID: ${s.schemeId}\n`;
            report += `- Status: ${s.status} | Days: ${s.daysActive}\n`;
            report += `- Risk: ${s.currentRiskScore} | Promotion: ${s.currentPromotionScore}\n`;
            report += `- Platforms: ${s.promotionPlatforms.join(', ')}\n\n`;
        }
    }

    if (medium.length > 0) {
        report += `## 🟢 MEDIUM PRIORITY - Monitor\n\n`;
        for (const s of medium) {
            report += `- **${s.symbol}** (${s.schemeId}): ${s.status}, Risk ${s.currentRiskScore}, Promo ${s.currentPromotionScore}\n`;
        }
        report += '\n';
    }

    return report;
}

// Export scheme data for external use
export function exportSchemeData(db: SchemeDatabase, format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
        return JSON.stringify(db, null, 2);
    }

    // CSV format
    const schemes = Object.values(db.schemes);
    const headers = [
        'Scheme ID', 'Symbol', 'Name', 'Status', 'First Detected', 'Last Seen',
        'Days Active', 'Current Risk Score', 'Peak Risk Score',
        'Current Price', 'Price at Detection', 'Peak Price',
        'Price Change from Detection %', 'Price Change from Peak %',
        'Promotion Platforms', 'Promoter Count', 'Signals'
    ];

    let csv = headers.join(',') + '\n';

    for (const s of schemes) {
        const row = [
            s.schemeId,
            s.symbol,
            `"${s.name.replace(/"/g, '""')}"`,
            s.status,
            s.firstDetected,
            s.lastSeen,
            s.daysActive,
            s.currentRiskScore,
            s.peakRiskScore,
            s.currentPrice,
            s.priceAtDetection,
            s.peakPrice,
            s.priceChangeFromDetection.toFixed(2),
            s.priceChangeFromPeak.toFixed(2),
            `"${s.promotionPlatforms.join('; ')}"`,
            s.promoterAccounts.length,
            `"${s.signalsDetected.join('; ')}"`
        ];
        csv += row.join(',') + '\n';
    }

    return csv;
}

// Archive old resolved schemes
export function archiveOldSchemes(db: SchemeDatabase, daysOld: number = 30): { archived: number; remaining: number } {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const toArchive: SchemeRecord[] = [];
    const remaining: Record<string, SchemeRecord> = {};

    for (const [id, scheme] of Object.entries(db.schemes)) {
        const lastSeen = new Date(scheme.lastSeen);

        if (scheme.status === 'RESOLVED' && lastSeen < cutoffDate) {
            toArchive.push(scheme);
        } else {
            remaining[id] = scheme;
        }
    }

    // Save archive
    if (toArchive.length > 0) {
        const archivePath = path.join(SCHEME_DB_DIR, `archive-${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(archivePath, JSON.stringify(toArchive, null, 2));
    }

    db.schemes = remaining;
    saveSchemeDatabase(db);

    return { archived: toArchive.length, remaining: Object.keys(remaining).length };
}

// CLI for scheme management
if (require.main === module) {
    const command = process.argv[2];
    const db = loadSchemeDatabase();

    switch (command) {
        case 'list':
            console.log('\n=== ACTIVE SCHEMES ===\n');
            const summaries = getSchemeSummaries(db);
            for (const s of summaries) {
                console.log(`[${s.urgency.toUpperCase()}] ${s.symbol} (${s.schemeId})`);
                console.log(`  Status: ${s.status} | Days: ${s.daysActive}`);
                console.log(`  Risk: ${s.currentRiskScore} | Promo: ${s.currentPromotionScore}`);
                console.log(`  Price: ${s.priceChangeFromDetection.toFixed(1)}% from detection`);
                console.log('');
            }
            break;

        case 'report':
            const date = process.argv[3] || new Date().toISOString().split('T')[0];
            const report = generateDailySchemeReport(db, date);
            console.log(report);

            // Also save to file
            const reportPath = path.join(RESULTS_DIR, `scheme-report-${date}.md`);
            fs.writeFileSync(reportPath, report);
            console.log(`\nReport saved to: ${reportPath}`);
            break;

        case 'export':
            const format = (process.argv[3] || 'json') as 'json' | 'csv';
            const exportData = exportSchemeData(db, format);
            const exportPath = path.join(RESULTS_DIR, `schemes-export.${format}`);
            fs.writeFileSync(exportPath, exportData);
            console.log(`Exported to: ${exportPath}`);
            break;

        case 'archive':
            const days = parseInt(process.argv[3]) || 30;
            const result = archiveOldSchemes(db, days);
            console.log(`Archived ${result.archived} schemes older than ${days} days`);
            console.log(`Remaining active: ${result.remaining}`);
            break;

        case 'stats':
            console.log('\n=== SCHEME DATABASE STATISTICS ===\n');
            console.log(`Last Updated: ${db.lastUpdated}`);
            console.log(`Total Schemes: ${db.totalSchemes}`);
            console.log(`Active Schemes: ${db.activeSchemes}`);
            console.log(`Resolved Schemes: ${db.resolvedSchemes}`);
            console.log(`Confirmed Frauds: ${db.confirmedFrauds}`);
            break;

        default:
            console.log('Usage: npx ts-node scheme-tracker.ts <command>');
            console.log('\nCommands:');
            console.log('  list     - List all active schemes');
            console.log('  report   - Generate daily report');
            console.log('  export   - Export data (json or csv)');
            console.log('  archive  - Archive old resolved schemes');
            console.log('  stats    - Show database statistics');
    }
}
