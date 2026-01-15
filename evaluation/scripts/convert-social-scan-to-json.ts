/**
 * Convert Social Media Scan Markdown Report to JSON
 *
 * Parses the social media scan markdown reports and extracts
 * promoted stock data into a structured JSON format for ingestion.
 *
 * Usage:
 *   npx ts-node scripts/convert-social-scan-to-json.ts [date]
 */

import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

interface PromotedStock {
  symbol: string;
  name: string;
  riskScore: number;
  price: number | null;
  marketCap: string | null;
  dailyMove: string | null;
  tier: string; // 'HIGH', 'MODERATE', 'STRUCTURAL'
  platforms: string[];
  redFlags: string[];
  sources: string[];
  assessment: string | null;
}

interface SocialMediaScanReport {
  date: string;
  totalHighRiskStocks: number;
  promotedStocks: PromotedStock[];
  platformSummary: {
    platform: string;
    evidenceFound: string;
    notableStocks: string[];
  }[];
}

function parseMarkdownReport(content: string, date: string): SocialMediaScanReport {
  const report: SocialMediaScanReport = {
    date,
    totalHighRiskStocks: 0,
    promotedStocks: [],
    platformSummary: [],
  };

  // Extract total high-risk count from executive summary
  const totalMatch = content.match(/(\d+)\s*HIGH-risk stocks/i);
  if (totalMatch) {
    report.totalHighRiskStocks = parseInt(totalMatch[1]);
  }

  // Parse platform summary table
  const platformTableMatch = content.match(/\| Platform \| Evidence Found \| Notable Stocks \|([\s\S]*?)\n\n/);
  if (platformTableMatch) {
    const rows = platformTableMatch[1].split('\n').filter(row => row.includes('|') && !row.includes('---'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 3) {
        report.platformSummary.push({
          platform: cells[0],
          evidenceFound: cells[1],
          notableStocks: cells[2].split(',').map(s => s.trim()),
        });
      }
    }
  }

  // Parse Tier 1: High Concern stocks
  const tier1Match = content.match(/### Tier 1: High Concern[\s\S]*?(?=### Tier 2:|### Tier 3:|## |$)/);
  if (tier1Match) {
    const stocks = parseStockSections(tier1Match[0], 'HIGH');
    report.promotedStocks.push(...stocks);
  }

  // Parse Tier 2: Moderate Concern stocks
  const tier2Match = content.match(/### Tier 2: Moderate Concern[\s\S]*?(?=### Tier 3:|## |$)/);
  if (tier2Match) {
    const stocks = parseStockSections(tier2Match[0], 'MODERATE');
    report.promotedStocks.push(...stocks);
  }

  // Parse Tier 3 table if present
  const tier3TableMatch = content.match(/### Tier 3: Structural Risk[\s\S]*?\| Ticker \| Company \|[\s\S]*?(?=\n\n##|\n\n---|\n\n$|$)/);
  if (tier3TableMatch) {
    const rows = tier3TableMatch[0].split('\n').filter(row => row.includes('|') && !row.includes('---') && !row.includes('Ticker'));
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 6) {
        report.promotedStocks.push({
          symbol: cells[0],
          name: cells[1],
          riskScore: parseInt(cells[2]) || 0,
          price: parseFloat(cells[3].replace('$', '')) || null,
          marketCap: cells[4],
          dailyMove: null,
          tier: 'STRUCTURAL',
          platforms: [],
          redFlags: [cells[5]],
          sources: [],
          assessment: null,
        });
      }
    }
  }

  return report;
}

function parseStockSections(content: string, tier: string): PromotedStock[] {
  const stocks: PromotedStock[] = [];

  // Match individual stock sections
  const stockRegex = /####\s*(\w+)\s*\(([^)]+)\)[^\n]*\n([\s\S]*?)(?=####|$)/g;
  let match;

  while ((match = stockRegex.exec(content)) !== null) {
    const symbol = match[1];
    const name = match[2];
    const details = match[3];

    // Extract price, market cap, daily move
    const priceMatch = details.match(/\*\*Price:\*\*\s*\$?([\d.]+)/);
    const marketCapMatch = details.match(/\*\*Market Cap:\*\*\s*([\$\d.]+[BMK]?)/);
    const dailyMoveMatch = details.match(/\*\*Daily Move:\*\*\s*([+-]?[\d.]+%|Volatile)/);
    const scoreMatch = details.match(/Risk Score:\s*(\d+)/);

    // Extract red flags
    const redFlags: string[] = [];
    const redFlagMatch = details.match(/\*\*Red Flags:\*\*([\s\S]*?)(?=\*\*Source|\*\*Assessment|$)/);
    if (redFlagMatch) {
      const flags = redFlagMatch[1].match(/-\s*([^\n]+)/g);
      if (flags) {
        redFlags.push(...flags.map(f => f.replace(/^-\s*/, '').trim()));
      }
    }

    // Extract platforms
    const platforms: string[] = [];
    const platformMatch = details.match(/\*\*Social Media Activity:\*\*\s*([^\n]+)/);
    if (platformMatch) {
      const text = platformMatch[1].toLowerCase();
      if (text.includes('reddit')) platforms.push('Reddit');
      if (text.includes('twitter') || text.includes('fintwit')) platforms.push('Twitter');
      if (text.includes('stocktwits')) platforms.push('StockTwits');
      if (text.includes('discord')) platforms.push('Discord');
      if (text.includes('telegram')) platforms.push('Telegram');
    }

    // Extract sources
    const sources: string[] = [];
    const sourceMatches = details.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
    for (const sourceMatch of sourceMatches) {
      sources.push(sourceMatch[2]);
    }

    // Extract assessment
    const assessmentMatch = details.match(/\*\*Assessment:\*\*\s*([^\n]+)/);

    stocks.push({
      symbol,
      name,
      riskScore: scoreMatch ? parseInt(scoreMatch[1]) : 0,
      price: priceMatch ? parseFloat(priceMatch[1]) : null,
      marketCap: marketCapMatch ? marketCapMatch[1] : null,
      dailyMove: dailyMoveMatch ? dailyMoveMatch[1] : null,
      tier,
      platforms,
      redFlags,
      sources,
      assessment: assessmentMatch ? assessmentMatch[1] : null,
    });
  }

  return stocks;
}

async function convertReport(date: string) {
  const mdPath = path.join(RESULTS_DIR, `social-media-scan-report-${date}.md`);
  const jsonPath = path.join(RESULTS_DIR, `promoted-stocks-${date}.json`);

  if (!fs.existsSync(mdPath)) {
    console.log(`No social media scan report found for ${date}`);
    return null;
  }

  console.log(`Converting ${mdPath}...`);
  const content = fs.readFileSync(mdPath, 'utf-8');
  const report = parseMarkdownReport(content, date);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Created ${jsonPath}`);
  console.log(`  - Total promoted stocks: ${report.promotedStocks.length}`);
  console.log(`  - Tier HIGH: ${report.promotedStocks.filter(s => s.tier === 'HIGH').length}`);
  console.log(`  - Tier MODERATE: ${report.promotedStocks.filter(s => s.tier === 'MODERATE').length}`);
  console.log(`  - Tier STRUCTURAL: ${report.promotedStocks.filter(s => s.tier === 'STRUCTURAL').length}`);

  return report;
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--all') {
    // Convert all available markdown reports
    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith('social-media-scan-report-'));
    for (const file of files) {
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        await convertReport(dateMatch[1]);
      }
    }
  } else {
    const date = args[0] || new Date().toISOString().split('T')[0];
    await convertReport(date);
  }
}

export { convertReport, SocialMediaScanReport, PromotedStock };

if (require.main === module) {
  main().catch(console.error);
}
