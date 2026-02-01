#!/usr/bin/env tsx
/**
 * ScamDunk History Dashboard Server
 *
 * A standalone web dashboard for viewing risk trends and analysis.
 *
 * Usage:
 *   npm run dashboard
 *   npm run dashboard -- --port 3002
 */

import express from 'express';
import { format, subDays } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';

const app = express();
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001');

// Middleware
app.use(express.json());

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ============================================================
// API ENDPOINTS
// ============================================================

// Get summary statistics
app.get('/api/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = subDays(new Date(), days);

    const summaries = await prisma.dailyScanSummary.findMany({
      where: { scanDate: { gte: startDate } },
      orderBy: { scanDate: 'desc' },
    });

    const latest = summaries[0];
    const earliest = summaries[summaries.length - 1];

    res.json({
      latest: latest ? {
        date: format(latest.scanDate, 'yyyy-MM-dd'),
        evaluated: latest.evaluated,
        low: latest.lowRiskCount,
        medium: latest.mediumRiskCount,
        high: latest.highRiskCount,
        pumpDropCount: latest.spikeDropCount,
        activePumpCount: latest.activePumpCount,
      } : null,
      trend: {
        days,
        highRiskChange: latest && earliest
          ? latest.highRiskCount - earliest.highRiskCount
          : 0,
        highRiskChangePct: latest && earliest && earliest.highRiskCount > 0
          ? ((latest.highRiskCount - earliest.highRiskCount) / earliest.highRiskCount * 100).toFixed(1)
          : '0',
      },
      dailyData: summaries.map(s => ({
        date: format(s.scanDate, 'yyyy-MM-dd'),
        evaluated: s.evaluated,
        low: s.lowRiskCount,
        medium: s.mediumRiskCount,
        high: s.highRiskCount,
        pumpDrop: s.spikeDropCount || 0,
        activePump: s.activePumpCount || 0,
      })).reverse(),
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get recent alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as string;

    const where: any = {};
    if (type) {
      where.alertType = type;
    }

    const alerts = await prisma.riskAlert.findMany({
      where,
      include: { stock: true },
      orderBy: { alertDate: 'desc' },
      take: limit,
    });

    res.json(alerts.map(a => ({
      id: a.id,
      date: format(a.alertDate, 'yyyy-MM-dd'),
      symbol: a.stock.symbol,
      name: a.stock.name,
      alertType: a.alertType,
      previousRisk: a.previousRiskLevel,
      newRisk: a.newRiskLevel,
      previousScore: a.previousScore,
      newScore: a.newScore,
      price: a.priceAtAlert,
    })));
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get risk changes
app.get('/api/risk-changes', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const startDate = subDays(new Date(), days);

    const where: any = { fromDate: { gte: startDate } };
    if (from) where.fromRiskLevel = from.toUpperCase();
    if (to) where.toRiskLevel = to.toUpperCase();

    const changes = await prisma.stockRiskChange.findMany({
      where,
      orderBy: [{ toDate: 'desc' }, { scoreChange: 'desc' }],
      take: limit,
    });

    res.json(changes.map(c => ({
      symbol: c.symbol,
      fromDate: format(c.fromDate, 'yyyy-MM-dd'),
      toDate: format(c.toDate, 'yyyy-MM-dd'),
      fromRisk: c.fromRiskLevel,
      toRisk: c.toRiskLevel,
      scoreChange: c.scoreChange,
      priceChange: c.priceChangePct,
      newSignals: c.newSignals,
    })));
  } catch (error) {
    console.error('Error fetching risk changes:', error);
    res.status(500).json({ error: 'Failed to fetch risk changes' });
  }
});

// Get stock history
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days as string) || 30;
    const startDate = subDays(new Date(), days);

    const stock = await prisma.stock.findUnique({
      where: { symbol },
    });

    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const snapshots = await prisma.stockDailySnapshot.findMany({
      where: { stockId: stock.id, scanDate: { gte: startDate } },
      orderBy: { scanDate: 'asc' },
    });

    const socialScans = await prisma.socialMediaScan.findMany({
      where: { stockId: stock.id, scanDate: { gte: startDate } },
      orderBy: { scanDate: 'desc' },
    });

    const alerts = await prisma.riskAlert.findMany({
      where: { stockId: stock.id, alertDate: { gte: startDate } },
      orderBy: { alertDate: 'desc' },
    });

    res.json({
      stock: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector,
        industry: stock.industry,
      },
      history: snapshots.map(s => ({
        date: format(s.scanDate, 'yyyy-MM-dd'),
        riskLevel: s.riskLevel,
        score: s.totalScore,
        price: s.lastPrice,
        marketCap: s.marketCap,
        signals: s.signalSummary,
      })),
      socialMedia: socialScans.map(s => ({
        date: format(s.scanDate, 'yyyy-MM-dd'),
        isPromoted: s.isPromoted,
        promoter: s.promoterName,
        platform: s.promotionSource,
        gain: s.gainFromPromotion,
        pumpAndDump: s.pumpAndDumpConfirmed,
      })),
      alerts: alerts.map(a => ({
        date: format(a.alertDate, 'yyyy-MM-dd'),
        type: a.alertType,
        fromRisk: a.previousRiskLevel,
        toRisk: a.newRiskLevel,
        score: a.newScore,
      })),
    });
  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

// Get promoted stocks
app.get('/api/promoted', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const promoted = await prisma.promotedStockWatchlist.findMany({
      where: { isActive: true },
      orderBy: { addedDate: 'desc' },
      take: limit,
    });

    res.json(promoted.map(p => ({
      symbol: p.symbol,
      addedDate: format(p.addedDate, 'yyyy-MM-dd'),
      promoter: p.promoterName,
      platform: p.promotionPlatform,
      group: p.promotionGroup,
      entryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      peakPrice: p.peakPrice,
      outcome: p.outcome,
      maxGain: p.maxGainPct,
      currentGain: p.currentGainPct,
      riskScore: p.entryRiskScore,
    })));
  } catch (error) {
    console.error('Error fetching promoted stocks:', error);
    res.status(500).json({ error: 'Failed to fetch promoted stocks' });
  }
});

// Search stocks
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 1) {
      return res.json([]);
    }

    const stocks = await prisma.stock.findMany({
      where: {
        OR: [
          { symbol: { contains: query.toUpperCase() } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });

    res.json(stocks.map(s => ({
      symbol: s.symbol,
      name: s.name,
      exchange: s.exchange,
    })));
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get database stats
app.get('/api/stats', async (req, res) => {
  try {
    const [
      stockCount,
      snapshotCount,
      alertCount,
      socialCount,
      summaryCount,
    ] = await Promise.all([
      prisma.stock.count(),
      prisma.stockDailySnapshot.count(),
      prisma.riskAlert.count(),
      prisma.socialMediaScan.count(),
      prisma.dailyScanSummary.count(),
    ]);

    const latestSummary = await prisma.dailyScanSummary.findFirst({
      orderBy: { scanDate: 'desc' },
    });

    res.json({
      stocks: stockCount,
      snapshots: snapshotCount,
      alerts: alertCount,
      socialScans: socialCount,
      dailySummaries: summaryCount,
      latestScan: latestSummary ? format(latestSummary.scanDate, 'yyyy-MM-dd') : null,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================================
// DASHBOARD HTML
// ============================================================

app.get('/', (req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScamDunk History Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    .card { @apply bg-white rounded-lg shadow-md p-6; }
    .stat-card { @apply bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border; }
    .risk-low { @apply text-green-600 bg-green-100; }
    .risk-medium { @apply text-yellow-600 bg-yellow-100; }
    .risk-high { @apply text-red-600 bg-red-100; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <nav class="bg-indigo-600 text-white p-4 shadow-lg">
    <div class="container mx-auto flex justify-between items-center">
      <h1 class="text-2xl font-bold">ScamDunk History Dashboard</h1>
      <div class="flex items-center gap-4">
        <input type="text" id="search" placeholder="Search stocks..."
               class="px-4 py-2 rounded-lg text-gray-800 w-64">
        <span id="lastUpdate" class="text-sm opacity-75">Loading...</span>
      </div>
    </div>
  </nav>

  <main class="container mx-auto p-6">
    <!-- Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card border-blue-300">
        <div class="text-sm text-gray-500">Total Stocks</div>
        <div id="totalStocks" class="text-3xl font-bold text-blue-600">-</div>
      </div>
      <div class="stat-card border-green-300">
        <div class="text-sm text-gray-500">Low Risk</div>
        <div id="lowRisk" class="text-3xl font-bold text-green-600">-</div>
      </div>
      <div class="stat-card border-yellow-300">
        <div class="text-sm text-gray-500">Medium Risk</div>
        <div id="mediumRisk" class="text-3xl font-bold text-yellow-600">-</div>
      </div>
      <div class="stat-card border-red-300">
        <div class="text-sm text-gray-500">High Risk</div>
        <div id="highRisk" class="text-3xl font-bold text-red-600">-</div>
      </div>
    </div>

    <!-- Trend Chart -->
    <div class="card mb-6">
      <h2 class="text-xl font-semibold mb-4">Risk Distribution Over Time</h2>
      <canvas id="trendChart" height="100"></canvas>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Recent Alerts -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-4">Recent Alerts</h2>
        <div id="alerts" class="space-y-2 max-h-96 overflow-y-auto">
          <p class="text-gray-500">Loading...</p>
        </div>
      </div>

      <!-- Promoted Stocks -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-4">Promoted Stocks Watchlist</h2>
        <div id="promoted" class="space-y-2 max-h-96 overflow-y-auto">
          <p class="text-gray-500">Loading...</p>
        </div>
      </div>
    </div>

    <!-- Risk Changes -->
    <div class="card mb-6">
      <h2 class="text-xl font-semibold mb-4">Recent Risk Level Changes</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left">Symbol</th>
              <th class="px-4 py-2 text-left">Date</th>
              <th class="px-4 py-2 text-left">From</th>
              <th class="px-4 py-2 text-left">To</th>
              <th class="px-4 py-2 text-left">Score Change</th>
              <th class="px-4 py-2 text-left">Price Change</th>
            </tr>
          </thead>
          <tbody id="riskChanges">
            <tr><td colspan="6" class="text-center py-4 text-gray-500">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Stock Detail Modal -->
    <div id="stockModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h2 id="modalTitle" class="text-2xl font-bold">Stock Details</h2>
          <button onclick="closeModal()" class="text-gray-500 hover:text-gray-700">&times;</button>
        </div>
        <div id="modalContent">Loading...</div>
      </div>
    </div>
  </main>

  <script>
    let trendChart = null;

    async function fetchData() {
      try {
        // Fetch summary
        const summaryRes = await fetch('/api/summary?days=30');
        const summary = await summaryRes.json();

        if (summary.latest) {
          document.getElementById('totalStocks').textContent = summary.latest.evaluated.toLocaleString();
          document.getElementById('lowRisk').textContent = summary.latest.low.toLocaleString();
          document.getElementById('mediumRisk').textContent = summary.latest.medium.toLocaleString();
          document.getElementById('highRisk').textContent = summary.latest.high.toLocaleString();
          document.getElementById('lastUpdate').textContent = 'Last scan: ' + summary.latest.date;
        }

        // Update chart
        if (summary.dailyData && summary.dailyData.length > 0) {
          updateChart(summary.dailyData);
        }

        // Fetch alerts
        const alertsRes = await fetch('/api/alerts?limit=10');
        const alerts = await alertsRes.json();
        renderAlerts(alerts);

        // Fetch promoted
        const promotedRes = await fetch('/api/promoted?limit=10');
        const promoted = await promotedRes.json();
        renderPromoted(promoted);

        // Fetch risk changes
        const changesRes = await fetch('/api/risk-changes?days=7&limit=20');
        const changes = await changesRes.json();
        renderRiskChanges(changes);

      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }

    function updateChart(data) {
      const ctx = document.getElementById('trendChart').getContext('2d');

      if (trendChart) {
        trendChart.destroy();
      }

      trendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => d.date),
          datasets: [
            {
              label: 'High Risk',
              data: data.map(d => d.high),
              borderColor: 'rgb(239, 68, 68)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
            },
            {
              label: 'Medium Risk',
              data: data.map(d => d.medium),
              borderColor: 'rgb(234, 179, 8)',
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              fill: true,
            },
            {
              label: 'Low Risk',
              data: data.map(d => d.low),
              borderColor: 'rgb(34, 197, 94)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
          },
          scales: {
            y: { beginAtZero: true },
          },
        },
      });
    }

    function renderAlerts(alerts) {
      const container = document.getElementById('alerts');
      if (alerts.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No recent alerts</p>';
        return;
      }

      container.innerHTML = alerts.map(a => \`
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
             onclick="showStock('\${a.symbol}')">
          <div>
            <span class="font-semibold">\${a.symbol}</span>
            <span class="text-sm text-gray-500 ml-2">\${a.date}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 rounded text-xs \${getRiskClass(a.previousRisk)}">\${a.previousRisk || 'N/A'}</span>
            <span>→</span>
            <span class="px-2 py-1 rounded text-xs \${getRiskClass(a.newRisk)}">\${a.newRisk}</span>
          </div>
        </div>
      \`).join('');
    }

    function renderPromoted(promoted) {
      const container = document.getElementById('promoted');
      if (promoted.length === 0) {
        container.innerHTML = '<p class="text-gray-500">No promoted stocks tracked</p>';
        return;
      }

      container.innerHTML = promoted.map(p => \`
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
             onclick="showStock('\${p.symbol}')">
          <div>
            <span class="font-semibold">\${p.symbol}</span>
            <span class="text-sm text-gray-500 ml-2">\${p.promoter} (\${p.platform})</span>
          </div>
          <div class="text-right">
            <div class="text-sm">
              \${p.currentGain > 0 ? '+' : ''}\${p.currentGain?.toFixed(1) || 0}%
              <span class="text-xs text-gray-500">(max: +\${p.maxGain?.toFixed(1) || 0}%)</span>
            </div>
            <div class="text-xs \${p.outcome === 'DUMPED' ? 'text-red-600' : 'text-orange-600'}">\${p.outcome || 'TRACKING'}</div>
          </div>
        </div>
      \`).join('');
    }

    function renderRiskChanges(changes) {
      const tbody = document.getElementById('riskChanges');
      if (changes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">No risk changes</td></tr>';
        return;
      }

      tbody.innerHTML = changes.map(c => \`
        <tr class="border-t cursor-pointer hover:bg-gray-50" onclick="showStock('\${c.symbol}')">
          <td class="px-4 py-2 font-semibold">\${c.symbol}</td>
          <td class="px-4 py-2 text-sm text-gray-500">\${c.toDate}</td>
          <td class="px-4 py-2"><span class="px-2 py-1 rounded text-xs \${getRiskClass(c.fromRisk)}">\${c.fromRisk}</span></td>
          <td class="px-4 py-2"><span class="px-2 py-1 rounded text-xs \${getRiskClass(c.toRisk)}">\${c.toRisk}</span></td>
          <td class="px-4 py-2 \${c.scoreChange > 0 ? 'text-red-600' : 'text-green-600'}">
            \${c.scoreChange > 0 ? '+' : ''}\${c.scoreChange}
          </td>
          <td class="px-4 py-2 \${(c.priceChange || 0) > 0 ? 'text-green-600' : 'text-red-600'}">
            \${c.priceChange ? (c.priceChange > 0 ? '+' : '') + c.priceChange.toFixed(1) + '%' : 'N/A'}
          </td>
        </tr>
      \`).join('');
    }

    function getRiskClass(risk) {
      switch (risk) {
        case 'LOW': return 'risk-low';
        case 'MEDIUM': return 'risk-medium';
        case 'HIGH': return 'risk-high';
        default: return 'bg-gray-100 text-gray-600';
      }
    }

    async function showStock(symbol) {
      document.getElementById('stockModal').classList.remove('hidden');
      document.getElementById('modalTitle').textContent = symbol;
      document.getElementById('modalContent').innerHTML = '<p class="text-gray-500">Loading...</p>';

      try {
        const res = await fetch(\`/api/stock/\${symbol}?days=30\`);
        const data = await res.json();

        if (data.error) {
          document.getElementById('modalContent').innerHTML = \`<p class="text-red-500">\${data.error}</p>\`;
          return;
        }

        document.getElementById('modalContent').innerHTML = \`
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p class="text-sm text-gray-500">Name</p>
              <p class="font-semibold">\${data.stock.name}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Exchange</p>
              <p class="font-semibold">\${data.stock.exchange}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Sector</p>
              <p class="font-semibold">\${data.stock.sector || 'Unknown'}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Industry</p>
              <p class="font-semibold">\${data.stock.industry || 'Unknown'}</p>
            </div>
          </div>

          <h3 class="font-semibold mb-2">Risk History (Last 30 Days)</h3>
          <div class="overflow-x-auto mb-4">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-2 py-1 text-left">Date</th>
                  <th class="px-2 py-1 text-left">Risk</th>
                  <th class="px-2 py-1 text-left">Score</th>
                  <th class="px-2 py-1 text-left">Price</th>
                  <th class="px-2 py-1 text-left">Signals</th>
                </tr>
              </thead>
              <tbody>
                \${data.history.map(h => \`
                  <tr class="border-t">
                    <td class="px-2 py-1">\${h.date}</td>
                    <td class="px-2 py-1"><span class="px-2 py-1 rounded text-xs \${getRiskClass(h.riskLevel)}">\${h.riskLevel}</span></td>
                    <td class="px-2 py-1">\${h.score}</td>
                    <td class="px-2 py-1">\${h.price ? '$' + h.price.toFixed(2) : 'N/A'}</td>
                    <td class="px-2 py-1 text-xs text-gray-500">\${h.signals || '-'}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>

          \${data.socialMedia.length > 0 ? \`
            <h3 class="font-semibold mb-2">Social Media Activity</h3>
            <div class="space-y-2 mb-4">
              \${data.socialMedia.map(s => \`
                <div class="p-2 bg-gray-50 rounded">
                  <div class="flex justify-between">
                    <span>\${s.date}</span>
                    <span class="text-sm">\${s.promoter} (\${s.platform})</span>
                  </div>
                  \${s.gain ? \`<div class="text-green-600">+\${s.gain.toFixed(1)}% gain</div>\` : ''}
                  \${s.pumpAndDump ? \`<div class="text-red-600 font-semibold">⚠️ Pump & Dump Confirmed</div>\` : ''}
                </div>
              \`).join('')}
            </div>
          \` : ''}

          \${data.alerts.length > 0 ? \`
            <h3 class="font-semibold mb-2">Alerts</h3>
            <div class="space-y-2">
              \${data.alerts.map(a => \`
                <div class="p-2 bg-gray-50 rounded flex justify-between">
                  <span>\${a.date}: \${a.type}</span>
                  <span>\${a.fromRisk || 'N/A'} → \${a.toRisk}</span>
                </div>
              \`).join('')}
            </div>
          \` : ''}
        \`;
      } catch (error) {
        document.getElementById('modalContent').innerHTML = \`<p class="text-red-500">Error loading stock data</p>\`;
      }
    }

    function closeModal() {
      document.getElementById('stockModal').classList.add('hidden');
    }

    // Search functionality
    document.getElementById('search').addEventListener('input', async (e) => {
      const query = e.target.value;
      if (query.length >= 1) {
        const res = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`);
        const results = await res.json();
        // Could show dropdown here
        if (results.length > 0 && query.toUpperCase() === results[0].symbol) {
          showStock(results[0].symbol);
        }
      }
    });

    document.getElementById('search').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const symbol = e.target.value.toUpperCase();
        if (symbol) showStock(symbol);
      }
    });

    // Close modal on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Initial load
    fetchData();

    // Auto-refresh every 5 minutes
    setInterval(fetchData, 300000);
  </script>
</body>
</html>`;
}

// ============================================================
// START SERVER
// ============================================================

async function main() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log('');
      console.log('═'.repeat(60));
      console.log('  ScamDunk History Dashboard');
      console.log('═'.repeat(60));
      console.log(`  Server running at: http://localhost:${PORT}`);
      console.log('');
      console.log('  API Endpoints:');
      console.log('    GET /api/summary      - Summary statistics');
      console.log('    GET /api/alerts       - Recent alerts');
      console.log('    GET /api/risk-changes - Risk level changes');
      console.log('    GET /api/stock/:symbol - Stock history');
      console.log('    GET /api/promoted     - Promoted stocks');
      console.log('    GET /api/search       - Search stocks');
      console.log('    GET /api/stats        - Database stats');
      console.log('═'.repeat(60));
      console.log('');
    });

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await disconnectDB();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
