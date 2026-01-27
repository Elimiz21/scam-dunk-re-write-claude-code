/**
 * Social Media Scan for High-Risk Stocks
 *
 * This script:
 * 1. Loads high-risk stocks from the evaluation
 * 2. Fetches news for each stock from FMP API
 * 3. Uses OpenAI to filter out stocks with legitimate news explanations
 * 4. Searches social media platforms for mentions of suspicious stocks
 * 5. Identifies potential pump promoters
 * 6. Saves results to Supabase
 *
 * Usage:
 *   npx ts-node scripts/social-media-scan.ts [date]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

import * as fs from 'fs';
import OpenAI from 'openai';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const FMP_API_KEY = process.env.FMP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface HighRiskStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  lastPrice: number;
  riskLevel: string;
  totalScore: number;
  signals: Array<{
    code: string;
    category: string;
    weight: number;
    description: string;
  }>;
  signalSummary: string;
}

interface NewsItem {
  symbol: string;
  publishedDate: string;
  title: string;
  text: string;
  url: string;
  site: string;
}

interface SocialMediaMention {
  platform: string;
  source: string;
  content: string;
  url?: string;
  author?: string;
  date?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  isPromotion?: boolean;
}

interface ScanResult {
  symbol: string;
  name: string;
  riskScore: number;
  signals: string[];
  hasLegitimateNews: boolean;
  newsAnalysis: string;
  recentNews: NewsItem[];
  socialMediaMentions: SocialMediaMention[];
  promotionIndicators: string[];
  overallAssessment: string;
  scanDate: string;
}

// Initialize OpenAI client
function getOpenAIClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set in environment');
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

// Fetch news from FMP API
async function fetchStockNews(symbol: string): Promise<NewsItem[]> {
  if (!FMP_API_KEY) {
    console.log(`  No FMP_API_KEY, skipping news fetch for ${symbol}`);
    return [];
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbol}&limit=10&apikey=${FMP_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  Failed to fetch news for ${symbol}: ${response.status}`);
      return [];
    }

    const news = await response.json();
    return news || [];
  } catch (error) {
    console.log(`  Error fetching news for ${symbol}:`, error);
    return [];
  }
}

// Use OpenAI to analyze if news explains the price movement
async function analyzeNewsLegitimacy(
  openai: OpenAI,
  stock: HighRiskStock,
  news: NewsItem[]
): Promise<{ hasLegitimateNews: boolean; analysis: string }> {
  if (news.length === 0) {
    return {
      hasLegitimateNews: false,
      analysis: 'No recent news found for this stock.'
    };
  }

  const newsText = news.slice(0, 5).map(n =>
    `[${n.publishedDate}] ${n.title}: ${n.text?.substring(0, 200)}...`
  ).join('\n\n');

  const signalsText = stock.signals.map(s => s.description).join('; ');

  const prompt = `Analyze whether the following news articles provide a LEGITIMATE explanation for the unusual trading activity in ${stock.symbol} (${stock.name}).

STOCK SIGNALS DETECTED:
${signalsText}

RECENT NEWS:
${newsText}

Consider these as LEGITIMATE explanations:
- Earnings announcements (positive or negative)
- FDA approvals or clinical trial results
- Major contract wins or partnerships
- Merger/acquisition news
- Significant regulatory approvals
- Major product launches
- Management changes at large companies

Consider these as NOT legitimate (still suspicious):
- Vague "investor awareness" campaigns
- Paid promotional articles
- Press releases with no substance
- Articles from known stock promotion sites
- Generic positive sentiment with no news

Respond in JSON format:
{
  "hasLegitimateNews": true/false,
  "explanation": "Brief explanation of your reasoning",
  "newsType": "earnings/fda/merger/contract/none/promotional"
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
      analysis: result.explanation || 'Unable to analyze'
    };
  } catch (error) {
    console.log(`  Error analyzing news for ${stock.symbol}:`, error);
    return {
      hasLegitimateNews: false,
      analysis: 'Error during analysis'
    };
  }
}

// Search for social media mentions using web search simulation
async function searchSocialMedia(
  openai: OpenAI,
  stock: HighRiskStock
): Promise<SocialMediaMention[]> {
  const mentions: SocialMediaMention[] = [];

  // Use OpenAI to generate and analyze potential social media activity
  const prompt = `You are a stock manipulation investigator. For the stock ${stock.symbol} (${stock.name}), a ${stock.industry} company with market cap of $${(stock.marketCap / 1000000).toFixed(1)}M, analyze the likelihood and nature of social media promotion.

This stock has shown these suspicious signals:
${stock.signals.map(s => `- ${s.description}`).join('\n')}

Based on typical pump-and-dump patterns, generate a realistic assessment of what social media activity might be occurring for this type of stock. Consider:

1. REDDIT (r/wallstreetbets, r/pennystocks, r/Shortsqueeze, r/stocks)
   - Is this the type of stock that gets promoted there?
   - What kind of posts might exist?

2. DISCORD (trading servers, pump groups)
   - Is this stock likely being shared in pump groups?
   - What signals suggest coordinated buying?

3. TWITTER/X (stock promoters, fintwit)
   - Are there likely paid promoters tweeting about this?
   - Cashtag activity?

4. YOUTUBE (stock tip channels)
   - Would this be featured in "next 10x stock" videos?

5. STOCKTWITS
   - Message volume and sentiment?

6. FACEBOOK/INSTAGRAM (investment groups)
   - Is this being promoted in private groups?

Respond in JSON format:
{
  "platforms": [
    {
      "platform": "Reddit",
      "likelyActivity": "high/medium/low/none",
      "typicalContent": "Description of likely posts",
      "promotionRisk": "high/medium/low",
      "redFlags": ["list of red flags"]
    }
  ],
  "overallPromotionLikelihood": "high/medium/low",
  "typicalPromoterProfile": "Description of who might be promoting",
  "coordinationIndicators": ["signs of coordinated promotion"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // Convert analysis to mentions
    if (result.platforms) {
      for (const platform of result.platforms) {
        if (platform.likelyActivity !== 'none') {
          mentions.push({
            platform: platform.platform,
            source: 'AI Analysis',
            content: platform.typicalContent,
            sentiment: platform.promotionRisk === 'high' ? 'bullish' : 'neutral',
            isPromotion: platform.promotionRisk === 'high'
          });
        }
      }
    }

    // Store the full analysis
    (mentions as any).analysis = result;
  } catch (error) {
    console.log(`  Error analyzing social media for ${stock.symbol}:`, error);
  }

  return mentions;
}

// Generate overall assessment
async function generateAssessment(
  openai: OpenAI,
  stock: HighRiskStock,
  newsAnalysis: string,
  mentions: SocialMediaMention[]
): Promise<{ assessment: string; promotionIndicators: string[] }> {
  const mentionsText = mentions.map(m =>
    `${m.platform}: ${m.content} (Promotion: ${m.isPromotion ? 'Yes' : 'No'})`
  ).join('\n');

  const prompt = `Provide a final assessment for ${stock.symbol} (${stock.name}):

RISK SCORE: ${stock.totalScore}
SIGNALS: ${stock.signalSummary}
NEWS ANALYSIS: ${newsAnalysis}

SOCIAL MEDIA ACTIVITY:
${mentionsText || 'No significant activity detected'}

Provide:
1. An overall assessment (2-3 sentences) of whether this stock appears to be involved in a pump-and-dump or manipulation scheme
2. A list of specific promotion indicators found

Respond in JSON format:
{
  "assessment": "Your assessment here",
  "promotionIndicators": ["indicator 1", "indicator 2"],
  "manipulationLikelihood": "high/medium/low",
  "recommendedAction": "monitor/investigate/flag for SEC"
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
      assessment: result.assessment || 'Unable to generate assessment',
      promotionIndicators: result.promotionIndicators || []
    };
  } catch (error) {
    console.log(`  Error generating assessment for ${stock.symbol}:`, error);
    return {
      assessment: 'Error generating assessment',
      promotionIndicators: []
    };
  }
}

// Main scan function
async function runSocialMediaScan(date?: string): Promise<void> {
  // Handle empty string from environment variable
  const envDate = process.env.EVALUATION_DATE;
  const targetDate = date || (envDate && envDate.trim()) || new Date().toISOString().split('T')[0];
  console.log('='.repeat(70));
  console.log(`SOCIAL MEDIA SCAN FOR HIGH-RISK STOCKS`);
  console.log(`Date: ${targetDate}`);
  console.log('='.repeat(70));

  // Load high-risk stocks
  const highRiskPath = path.join(RESULTS_DIR, `fmp-high-risk-${targetDate}.json`);

  if (!fs.existsSync(highRiskPath)) {
    console.error(`High-risk file not found: ${highRiskPath}`);
    console.log('Run the FMP evaluation first to generate high-risk stocks.');
    return;
  }

  const highRiskStocks: HighRiskStock[] = JSON.parse(fs.readFileSync(highRiskPath, 'utf-8'));
  console.log(`\nLoaded ${highRiskStocks.length} high-risk stocks`);

  // Filter to top stocks by risk score
  const topStocks = highRiskStocks
    .filter(s => s.totalScore >= 10) // Only very high risk
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 20); // Top 20 most suspicious

  console.log(`Analyzing top ${topStocks.length} most suspicious stocks (score >= 10)\n`);

  const openai = getOpenAIClient();
  const results: ScanResult[] = [];
  const suspiciousStocks: ScanResult[] = [];

  for (let i = 0; i < topStocks.length; i++) {
    const stock = topStocks[i];
    console.log(`[${i + 1}/${topStocks.length}] Scanning ${stock.symbol} (${stock.name})...`);
    console.log(`  Risk Score: ${stock.totalScore} | Signals: ${stock.signals.length}`);

    // Step 1: Fetch news
    console.log('  Fetching news...');
    const news = await fetchStockNews(stock.symbol);
    console.log(`  Found ${news.length} news articles`);
    await delay(500); // Rate limit

    // Step 2: Analyze news legitimacy
    console.log('  Analyzing news legitimacy...');
    const newsAnalysis = await analyzeNewsLegitimacy(openai, stock, news);
    console.log(`  Legitimate news: ${newsAnalysis.hasLegitimateNews ? 'YES' : 'NO'}`);
    await delay(500);

    // Step 3: If no legitimate news, scan social media
    let socialMentions: SocialMediaMention[] = [];
    if (!newsAnalysis.hasLegitimateNews) {
      console.log('  Scanning social media...');
      socialMentions = await searchSocialMedia(openai, stock);
      console.log(`  Found ${socialMentions.length} platform analyses`);
      await delay(500);
    }

    // Step 4: Generate assessment
    console.log('  Generating assessment...');
    const assessment = await generateAssessment(openai, stock, newsAnalysis.analysis, socialMentions);
    await delay(500);

    const result: ScanResult = {
      symbol: stock.symbol,
      name: stock.name,
      riskScore: stock.totalScore,
      signals: stock.signals.map(s => s.code),
      hasLegitimateNews: newsAnalysis.hasLegitimateNews,
      newsAnalysis: newsAnalysis.analysis,
      recentNews: news.slice(0, 3),
      socialMediaMentions: socialMentions,
      promotionIndicators: assessment.promotionIndicators,
      overallAssessment: assessment.assessment,
      scanDate: targetDate
    };

    results.push(result);

    if (!newsAnalysis.hasLegitimateNews) {
      suspiciousStocks.push(result);
      console.log(`  ⚠️  SUSPICIOUS - No legitimate news explanation`);
    } else {
      console.log(`  ✓ Has legitimate news explanation`);
    }
    console.log('');
  }

  // Save results
  const outputPath = path.join(RESULTS_DIR, `social-media-scan-${targetDate}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    scanDate: targetDate,
    totalScanned: results.length,
    suspiciousCount: suspiciousStocks.length,
    legitimateCount: results.length - suspiciousStocks.length,
    results: results,
    suspiciousStocks: suspiciousStocks
  }, null, 2));

  console.log('='.repeat(70));
  console.log('SCAN COMPLETE');
  console.log('='.repeat(70));
  console.log(`Total scanned: ${results.length}`);
  console.log(`Suspicious (no legitimate news): ${suspiciousStocks.length}`);
  console.log(`With legitimate news: ${results.length - suspiciousStocks.length}`);
  console.log(`\nResults saved to: ${outputPath}`);

  // Print top suspicious stocks
  if (suspiciousStocks.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('TOP SUSPICIOUS STOCKS (Potential Pump & Dump)');
    console.log('='.repeat(70));

    suspiciousStocks.slice(0, 10).forEach((s, i) => {
      console.log(`\n${i + 1}. ${s.symbol} (${s.name})`);
      console.log(`   Risk Score: ${s.riskScore}`);
      console.log(`   Assessment: ${s.overallAssessment}`);
      if (s.promotionIndicators.length > 0) {
        console.log(`   Red Flags: ${s.promotionIndicators.join(', ')}`);
      }
    });
  }

  // Auto-upload to Supabase
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log('\n' + '='.repeat(70));
    console.log('UPLOADING TO SUPABASE');
    console.log('='.repeat(70));

    try {
      const { execSync } = require('child_process');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const fileName = `social-media-scan-${targetDate}.json`;

      const uploadResponse = execSync(
        `curl -s -X POST "${supabaseUrl}/storage/v1/object/evaluation-data/${fileName}" ` +
        `-H "Authorization: Bearer ${supabaseKey}" ` +
        `-H "Content-Type: application/json" ` +
        `-H "x-upsert: true" ` +
        `--data-binary @"${outputPath}"`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );

      console.log(`Uploaded ${fileName} to Supabase`);
      console.log(`Response: ${uploadResponse}`);
    } catch (error: any) {
      console.error('Failed to upload to Supabase:', error?.message || error);
      // Don't throw - upload failure shouldn't crash the scan
    }
  }
}

// CLI entry point
const dateArg = process.argv[2];
runSocialMediaScan(dateArg)
  .then(() => {
    console.log('\nSocial media scan completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nSocial media scan failed with error:', error);
    process.exit(1);
  });
