/**
 * Admin Integrations Management
 * Functions for managing and testing API integrations
 */

import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { testOTCMarketsConnection } from "@/lib/otcMarkets";
import { testFINRAConnection } from "@/lib/finra";

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 12) return "Not configured";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Test OpenAI connection
 */
async function testOpenAI(): Promise<{ status: string; message?: string }> {
  if (!config.openaiApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
    });

    if (response.ok) {
      return { status: "CONNECTED" };
    } else {
      const error = await response.json();
      return { status: "ERROR", message: error.error?.message || "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Alpha Vantage connection
 */
async function testAlphaVantage(): Promise<{ status: string; message?: string }> {
  if (!config.alphaVantageApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${config.alphaVantageApiKey}`
    );

    if (response.ok) {
      const data = await response.json();
      if (data["Error Message"]) {
        return { status: "ERROR", message: data["Error Message"] };
      }
      if (data["Note"]) {
        return { status: "ERROR", message: "Rate limit exceeded" };
      }
      return { status: "CONNECTED" };
    } else {
      return { status: "ERROR", message: "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test PayPal connection
 */
async function testPayPal(): Promise<{ status: string; message?: string }> {
  if (!config.paypalClientId || !config.paypalClientSecret) {
    return { status: "ERROR", message: "API credentials not configured" };
  }

  try {
    const auth = Buffer.from(`${config.paypalClientId}:${config.paypalClientSecret}`).toString("base64");
    const baseUrl = config.paypalMode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (response.ok) {
      return { status: "CONNECTED" };
    } else {
      const error = await response.json();
      return { status: "ERROR", message: error.error_description || "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test database connection
 */
async function testDatabase(): Promise<{ status: string; message?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "CONNECTED" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test OTC Markets connection (free public API — no key required)
 */
async function testOTCMarkets(): Promise<{ status: string; message?: string }> {
  return testOTCMarketsConnection();
}

/**
 * Test FINRA BrokerCheck connection (free public API — no key required)
 */
async function testFINRA(): Promise<{ status: string; message?: string }> {
  return testFINRAConnection();
}

/**
 * Integration definitions with test functions
 */
const INTEGRATIONS = [
  {
    name: "OPENAI",
    displayName: "OpenAI",
    category: "API",
    description: "Powers AI narrative generation for scan results",
    getApiKey: () => config.openaiApiKey,
    testConnection: testOpenAI,
    rateLimit: 500, // requests per minute
    documentation: "https://platform.openai.com/docs",
  },
  {
    name: "ALPHA_VANTAGE",
    displayName: "Alpha Vantage",
    category: "API",
    description: "Provides real-time stock market data",
    getApiKey: () => config.alphaVantageApiKey,
    testConnection: testAlphaVantage,
    rateLimit: 5, // Free tier: 5 calls per minute
    documentation: "https://www.alphavantage.co/documentation/",
  },
  {
    name: "PAYPAL",
    displayName: "PayPal",
    category: "PAYMENT",
    description: "Handles subscription billing and payments",
    getApiKey: () => config.paypalClientId,
    testConnection: testPayPal,
    rateLimit: 100,
    documentation: "https://developer.paypal.com/docs/api/",
  },
  {
    name: "DATABASE",
    displayName: "PostgreSQL (Supabase)",
    category: "DATABASE",
    description: "Primary database for user data and analytics",
    getApiKey: () => process.env.DATABASE_URL,
    testConnection: testDatabase,
    documentation: "https://supabase.com/docs",
  },
  {
    name: "OTC_MARKETS",
    displayName: "OTC Markets",
    category: "REGULATORY",
    description: "Caveat Emptor flags, shell risk, tier data, compliance status (free public API)",
    getApiKey: () => config.otcMarketsApiKey || "FREE_PUBLIC_API",
    testConnection: testOTCMarkets,
    rateLimit: 30, // Conservative limit for the free public endpoint
    documentation: "https://www.otcmarkets.com/market-data/overview",
  },
  {
    name: "FINRA",
    displayName: "FINRA BrokerCheck",
    category: "REGULATORY",
    description: "Firm disclosures, disciplinary actions, broker misconduct (free public API)",
    getApiKey: () => config.finraApiKey || "FREE_PUBLIC_API",
    testConnection: testFINRA,
    rateLimit: 20, // Conservative limit for the free public endpoint
    documentation: "https://brokercheck.finra.org/",
  },
];

/**
 * Initialize or update integration configs in database
 */
export async function initializeIntegrations() {
  for (const integration of INTEGRATIONS) {
    const existing = await prisma.integrationConfig.findUnique({
      where: { name: integration.name },
    });

    if (!existing) {
      await prisma.integrationConfig.create({
        data: {
          name: integration.name,
          displayName: integration.displayName,
          category: integration.category,
          isEnabled: true,
          apiKeyMasked: maskApiKey(integration.getApiKey()),
          rateLimit: integration.rateLimit,
          status: "UNKNOWN",
        },
      });
    } else {
      // Update masked API key if changed
      const newMasked = maskApiKey(integration.getApiKey());
      if (existing.apiKeyMasked !== newMasked) {
        await prisma.integrationConfig.update({
          where: { name: integration.name },
          data: { apiKeyMasked: newMasked },
        });
      }
    }
  }
}

/**
 * Get all integrations with their current status
 */
export async function getIntegrations() {
  // Ensure all integrations are in the database
  await initializeIntegrations();

  const integrations = await prisma.integrationConfig.findMany({
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  });

  return integrations.map((integration) => {
    const definition = INTEGRATIONS.find((i) => i.name === integration.name);
    return {
      ...integration,
      description: definition?.description || "",
      documentation: definition?.documentation || "",
    };
  });
}

/**
 * Test a specific integration
 */
export async function testIntegration(name: string) {
  const definition = INTEGRATIONS.find((i) => i.name === name);
  if (!definition) {
    return { status: "ERROR", message: "Unknown integration" };
  }

  const result = await definition.testConnection();

  // Update database with result
  await prisma.integrationConfig.update({
    where: { name },
    data: {
      status: result.status,
      lastCheckedAt: new Date(),
      errorMessage: result.message || null,
    },
  });

  return result;
}

/**
 * Test all integrations
 */
export async function testAllIntegrations() {
  const results: Record<string, { status: string; message?: string }> = {};

  for (const integration of INTEGRATIONS) {
    results[integration.name] = await testIntegration(integration.name);
  }

  return results;
}

/**
 * Update integration configuration
 */
export async function updateIntegrationConfig(
  name: string,
  updates: {
    isEnabled?: boolean;
    monthlyBudget?: number | null;
    rateLimit?: number | null;
  }
) {
  const integration = await prisma.integrationConfig.findUnique({
    where: { name },
  });

  if (!integration) {
    throw new Error("Integration not found");
  }

  return prisma.integrationConfig.update({
    where: { name },
    data: {
      isEnabled: updates.isEnabled ?? integration.isEnabled,
      monthlyBudget: updates.monthlyBudget,
      rateLimit: updates.rateLimit,
    },
  });
}

/**
 * Get integration health summary
 */
export async function getIntegrationHealthSummary() {
  const integrations = await prisma.integrationConfig.findMany();

  const summary = {
    total: integrations.length,
    connected: integrations.filter((i) => i.status === "CONNECTED").length,
    errors: integrations.filter((i) => i.status === "ERROR").length,
    unknown: integrations.filter((i) => i.status === "UNKNOWN").length,
    disabled: integrations.filter((i) => !i.isEnabled).length,
  };

  return summary;
}
