// Run from Mac: node --env-file=.env scripts/update-cover-images.mjs
// Updates coverImage field for all 13 blog posts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const slugs = [
  "unveiling-the-mechanics-of-pump-and-dump-schemes-a-forensic-case-study",
  "understanding-float-size-a-key-to-detecting-stock-market-manipulation",
  "detecting-market-manipulation-the-power-of-volume-spike-analysis",
  "unmasking-telegram-scams-a-comprehensive-guide-to-recognizing-fraud-patterns",
  "sec-edgar-for-beginners-find-red-flags-before-scammers-find-you",
  "unmasking-ai-generated-stock-promotions-the-new-face-of-pump-and-dump-schemes",
  "whatsapp-and-discord-stock-scams-15-red-flags-that-signal-pump-and-dump-fraud",
  "how-scamdunks-ai-actually-works-a-look-under-the-hood",
  "110-nyse-micro-caps-currently-showing-pump-and-dump-patterns",
  "navigating-the-stock-manipulation-landscape-on-twitterx-essential-red-flags-for-investors",
  "unsolicited-stock-tips-spotting-sms-email-and-cold-call-scams",
  "pump-and-dump-as-a-service-inside-the-industrialization-of-stock-manipulation",
  "detecting-penny-stock-scams-a-forensic-investors-guide",
];

async function main() {
  let updated = 0;
  let notFound = [];

  for (const slug of slugs) {
    const coverImage = `/images/blog/${slug}.svg`;
    const result = await prisma.blogPost.updateMany({
      where: { slug },
      data: { coverImage },
    });
    if (result.count > 0) {
      console.log(`✅  ${slug}`);
      updated++;
    } else {
      console.log(`❌  NOT FOUND: ${slug}`);
      notFound.push(slug);
    }
  }

  console.log(`\nDone: ${updated} updated, ${notFound.length} not found.`);

  // Show final state
  const posts = await prisma.blogPost.findMany({
    select: { slug: true, coverImage: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nFinal state:");
  posts.forEach((p) => console.log(`  ${p.coverImage || "NULL"} | ${p.slug}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
