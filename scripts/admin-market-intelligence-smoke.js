/* eslint-disable no-console */
const { chromium } = require("playwright");

const baseUrl = process.env.BASE_URL || "https://scamdunk.com";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD environment variables.");
  process.exit(1);
}

async function openFirstIfPresent(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click({ timeout: 15000 }).catch(() => {});
      return selector;
    }
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { baseUrl, checks: [] };

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle", timeout: 60000 });

    const emailSelector = 'input[type="email"], input[name="email"]';
    const passwordSelector = 'input[type="password"], input[name="password"]';
    await page.waitForSelector(emailSelector, { timeout: 30000 });
    await page.fill(emailSelector, email);
    await page.fill(passwordSelector, password);

    const loginButton = page
      .locator('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")')
      .first();
    await loginButton.click();
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});

    report.checks.push({ step: "login", url: page.url() });

    await page.goto(`${baseUrl}/admin/scan-intelligence`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    report.checks.push({
      step: "open_scan_intelligence",
      ok: /scan-intelligence/.test(page.url()),
      url: page.url(),
    });

    const clickedStockSelector = await openFirstIfPresent(page, [
      'button:has-text("Stock")',
      'a:has-text("Stock")',
      'text=Full Deep Dive',
    ]);
    if (clickedStockSelector) {
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      report.checks.push({
        step: "click_stock",
        ok: /\/admin\/scan-intelligence\/stock\//.test(page.url()),
        via: clickedStockSelector,
        url: page.url(),
      });
    } else {
      report.checks.push({ step: "click_stock", ok: false, reason: "No stock link/button found" });
    }

    await page.goto(`${baseUrl}/admin/scan-intelligence`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const clickedSchemeSelector = await openFirstIfPresent(page, [
      '[class*="SchemeCard"]',
      'button:has-text("View Scheme")',
      'a[href*="/admin/scan-intelligence/scheme/"]',
    ]);
    if (clickedSchemeSelector) {
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      report.checks.push({
        step: "click_scheme",
        ok: /\/admin\/scan-intelligence\/scheme\//.test(page.url()),
        via: clickedSchemeSelector,
        url: page.url(),
      });
    } else {
      report.checks.push({ step: "click_scheme", ok: false, reason: "No scheme link/button found" });
    }

    await page.goto(`${baseUrl}/admin/scan-intelligence`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const clickedPromoterSelector = await openFirstIfPresent(page, [
      'button:has-text("SERIAL OFFENDER")',
      'a[href*="/admin/scan-intelligence/promoter/"]',
      'button:has-text("ACTIVE")',
    ]);
    if (clickedPromoterSelector) {
      await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
      report.checks.push({
        step: "click_promoter",
        ok: /\/admin\/scan-intelligence\/promoter\//.test(page.url()),
        via: clickedPromoterSelector,
        url: page.url(),
      });
    } else {
      report.checks.push({
        step: "click_promoter",
        ok: false,
        reason: "No promoter link/button found",
      });
    }

    await page.goto(`${baseUrl}/admin/social-scan`, { waitUntil: "networkidle", timeout: 60000 });
    report.checks.push({
      step: "open_social_scan",
      ok: /\/admin\/social-scan/.test(page.url()),
      url: page.url(),
    });
  } catch (error) {
    report.error = String(error);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
})();
