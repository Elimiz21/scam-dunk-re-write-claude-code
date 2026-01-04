/**
 * Fetch all US Stock Tickers from major exchanges
 *
 * Sources:
 * - NASDAQ: https://api.nasdaq.com/api/screener/stocks
 * - NYSE, AMEX: via SEC EDGAR or alternative APIs
 * - OTC Markets: for pink sheets/OTC stocks
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

interface StockTicker {
  symbol: string;
  name: string;
  exchange: string;
  marketCap?: number;
  sector?: string;
  industry?: string;
  lastPrice?: number;
  volume?: number;
  isOTC: boolean;
}

// Fetch NASDAQ listed stocks
async function fetchNasdaqStocks(): Promise<StockTicker[]> {
  console.log('Fetching NASDAQ stocks...');

  try {
    const response = await fetch(
      'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&exchange=NASDAQ',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`NASDAQ API error: ${response.status}`);
    }

    const data = await response.json();
    const rows = data?.data?.table?.rows || [];

    return rows.map((row: any) => ({
      symbol: row.symbol?.trim(),
      name: row.name?.trim(),
      exchange: 'NASDAQ',
      marketCap: parseMarketCap(row.marketCap),
      sector: row.sector,
      industry: row.industry,
      lastPrice: parseFloat(row.lastsale?.replace('$', '').replace(',', '')) || undefined,
      volume: parseInt(row.volume?.replace(/,/g, '')) || undefined,
      isOTC: false,
    })).filter((s: StockTicker) => s.symbol && s.symbol.length <= 5);
  } catch (error) {
    console.error('Error fetching NASDAQ stocks:', error);
    return [];
  }
}

// Fetch NYSE listed stocks
async function fetchNyseStocks(): Promise<StockTicker[]> {
  console.log('Fetching NYSE stocks...');

  try {
    const response = await fetch(
      'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&exchange=NYSE',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`NYSE API error: ${response.status}`);
    }

    const data = await response.json();
    const rows = data?.data?.table?.rows || [];

    return rows.map((row: any) => ({
      symbol: row.symbol?.trim(),
      name: row.name?.trim(),
      exchange: 'NYSE',
      marketCap: parseMarketCap(row.marketCap),
      sector: row.sector,
      industry: row.industry,
      lastPrice: parseFloat(row.lastsale?.replace('$', '').replace(',', '')) || undefined,
      volume: parseInt(row.volume?.replace(/,/g, '')) || undefined,
      isOTC: false,
    })).filter((s: StockTicker) => s.symbol && s.symbol.length <= 5);
  } catch (error) {
    console.error('Error fetching NYSE stocks:', error);
    return [];
  }
}

// Fetch AMEX listed stocks
async function fetchAmexStocks(): Promise<StockTicker[]> {
  console.log('Fetching AMEX stocks...');

  try {
    const response = await fetch(
      'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&exchange=AMEX',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`AMEX API error: ${response.status}`);
    }

    const data = await response.json();
    const rows = data?.data?.table?.rows || [];

    return rows.map((row: any) => ({
      symbol: row.symbol?.trim(),
      name: row.name?.trim(),
      exchange: 'AMEX',
      marketCap: parseMarketCap(row.marketCap),
      sector: row.sector,
      industry: row.industry,
      lastPrice: parseFloat(row.lastsale?.replace('$', '').replace(',', '')) || undefined,
      volume: parseInt(row.volume?.replace(/,/g, '')) || undefined,
      isOTC: false,
    })).filter((s: StockTicker) => s.symbol && s.symbol.length <= 5);
  } catch (error) {
    console.error('Error fetching AMEX stocks:', error);
    return [];
  }
}

// Parse market cap strings like "1.5B", "500M", etc.
function parseMarketCap(mcStr: string | undefined): number | undefined {
  if (!mcStr) return undefined;

  const cleaned = mcStr.replace(/[$,]/g, '').toUpperCase();
  const match = cleaned.match(/^([\d.]+)([KMBT])?$/);

  if (!match) return undefined;

  const value = parseFloat(match[1]);
  const suffix = match[2];

  switch (suffix) {
    case 'T': return value * 1_000_000_000_000;
    case 'B': return value * 1_000_000_000;
    case 'M': return value * 1_000_000;
    case 'K': return value * 1_000;
    default: return value;
  }
}

// Main function to fetch all stocks
async function fetchAllUSStocks(): Promise<void> {
  console.log('Starting US stock fetch...\n');

  const [nasdaq, nyse, amex] = await Promise.all([
    fetchNasdaqStocks(),
    fetchNyseStocks(),
    fetchAmexStocks(),
  ]);

  console.log(`\nFetched stocks:`);
  console.log(`  NASDAQ: ${nasdaq.length}`);
  console.log(`  NYSE: ${nyse.length}`);
  console.log(`  AMEX: ${amex.length}`);

  const allStocks = [...nasdaq, ...nyse, ...amex];

  // Remove duplicates by symbol
  const uniqueStocks = Array.from(
    new Map(allStocks.map(s => [s.symbol, s])).values()
  );

  console.log(`  Total unique: ${uniqueStocks.length}\n`);

  // Save to JSON
  const outputPath = path.join(DATA_DIR, 'us-stocks.json');
  fs.writeFileSync(outputPath, JSON.stringify(uniqueStocks, null, 2));
  console.log(`Saved to: ${outputPath}`);

  // Also save a CSV version
  const csvPath = path.join(DATA_DIR, 'us-stocks.csv');
  const csvHeader = 'Symbol,Name,Exchange,MarketCap,Sector,Industry,LastPrice,Volume,IsOTC\n';
  const csvRows = uniqueStocks.map(s =>
    `"${s.symbol}","${(s.name || '').replace(/"/g, '""')}","${s.exchange}",${s.marketCap || ''},` +
    `"${s.sector || ''}","${s.industry || ''}",${s.lastPrice || ''},${s.volume || ''},${s.isOTC}`
  ).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`Saved to: ${csvPath}`);

  // Summary by exchange
  const byExchange = uniqueStocks.reduce((acc, s) => {
    acc[s.exchange] = (acc[s.exchange] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nBy Exchange:');
  Object.entries(byExchange).forEach(([exchange, count]) => {
    console.log(`  ${exchange}: ${count}`);
  });

  // Summary by market cap
  const byMarketCap = {
    'Large Cap (>$10B)': uniqueStocks.filter(s => s.marketCap && s.marketCap > 10_000_000_000).length,
    'Mid Cap ($2B-$10B)': uniqueStocks.filter(s => s.marketCap && s.marketCap >= 2_000_000_000 && s.marketCap <= 10_000_000_000).length,
    'Small Cap ($300M-$2B)': uniqueStocks.filter(s => s.marketCap && s.marketCap >= 300_000_000 && s.marketCap < 2_000_000_000).length,
    'Micro Cap (<$300M)': uniqueStocks.filter(s => s.marketCap && s.marketCap < 300_000_000).length,
    'Unknown Market Cap': uniqueStocks.filter(s => !s.marketCap).length,
  };

  console.log('\nBy Market Cap:');
  Object.entries(byMarketCap).forEach(([category, count]) => {
    console.log(`  ${category}: ${count}`);
  });
}

// Run the fetch
fetchAllUSStocks().catch(console.error);
