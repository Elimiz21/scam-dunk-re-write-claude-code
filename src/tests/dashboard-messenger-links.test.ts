import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const whatsapp = readFileSync(join(root, "src/components/dashboard/DashboardWhatsAppLink.tsx"), "utf8");
const telegram = readFileSync(join(root, "src/components/dashboard/DashboardTelegramLink.tsx"), "utf8");

describe("dashboard messenger connections", () => {
  test("starts WhatsApp number verification from the dashboard instead of redirecting to settings", () => {
    expect(whatsapp).toContain('body: JSON.stringify({ action: "begin", phoneNumber: phone, resend: false })');
    expect(whatsapp).toContain('body: JSON.stringify({ action: "confirm", code })');
    expect(whatsapp).toContain('id="dashboard-whatsapp-phone"');
    expect(whatsapp).toContain('id="dashboard-whatsapp-code"');
    expect(whatsapp).not.toContain('window.location.assign("/account#whatsapp")');
  });

  test("opens Telegram in a user-initiated separate tab", () => {
    const openIndex = telegram.indexOf('window.open("about:blank", "_blank")');
    const fetchIndex = telegram.indexOf('await fetch("/api/user/telegram"');
    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(openIndex).toBeLessThan(fetchIndex);
    expect(telegram).toContain("telegramTab.opener = null");
    expect(telegram).toContain("telegramTab.location.replace(link.href)");
    expect(telegram).not.toContain("window.location.assign(link.href)");
  });
});
