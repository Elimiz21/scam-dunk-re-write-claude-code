import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const route = readFileSync(
  join(process.cwd(), "src/app/api/feature-interest/route.ts"),
  "utf8",
);
const form = readFileSync(
  join(process.cwd(), "src/components/BotInterestForm.tsx"),
  "utf8",
);
const landing = readFileSync(
  join(process.cwd(), "src/components/landing/LandingOptionA.tsx"),
  "utf8",
);

describe("messenger bot launch list", () => {
  test("stores one email per feature and exposes a public signup route", () => {
    expect(schema).toContain("model FeatureInterest");
    expect(schema).toContain("@@unique([email, feature])");
    expect(route).toContain('export async function POST');
    expect(route).toContain("WHATSAPP_BOT");
    expect(route).toContain("TELEGRAM_BOT");
    expect(route).toContain("featureInterest.upsert");
    expect(form).toContain("Get launch updates");
    expect(form).toContain("/api/feature-interest");
  });

  test("markets WhatsApp and Telegram as available instead of asking users to join a launch list", () => {
    expect(landing).toContain("WhatsApp and Telegram scans, available now");
    expect(landing).toContain("WhatsApp and Telegram scans are available now");
    expect(landing).not.toContain("Get updates when our Telegram and WhatsApp channels launch.");
    expect(landing).not.toContain("MESSENGER_UPDATES");
  });
});
