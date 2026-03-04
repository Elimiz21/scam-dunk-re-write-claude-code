-- Run this against your Supabase DB to set coverImage for all blog posts
-- Usage: psql $DATABASE_URL -f scripts/update-cover-images.sql

UPDATE "BlogPost" SET "coverImage" = '/images/blog/' || slug || '.svg'
WHERE slug IN (
  'unveiling-the-mechanics-of-pump-and-dump-schemes-a-forensic-case-study',
  'understanding-float-size-a-key-to-detecting-stock-market-manipulation',
  'detecting-market-manipulation-the-power-of-volume-spike-analysis',
  'unmasking-telegram-scams-a-comprehensive-guide-to-recognizing-fraud-patterns',
  'sec-edgar-for-beginners-find-red-flags-before-scammers-find-you',
  'unmasking-ai-generated-stock-promotions-the-new-face-of-pump-and-dump-schemes',
  'whatsapp-and-discord-stock-scams-15-red-flags-that-signal-pump-and-dump-fraud',
  'how-scamdunks-ai-actually-works-a-look-under-the-hood',
  '110-nyse-micro-caps-currently-showing-pump-and-dump-patterns',
  'navigating-the-stock-manipulation-landscape-on-twitterx-essential-red-flags-for-investors',
  'unsolicited-stock-tips-spotting-sms-email-and-cold-call-scams',
  'pump-and-dump-as-a-service-inside-the-industrialization-of-stock-manipulation',
  'detecting-penny-stock-scams-a-forensic-investors-guide'
);

-- Verify
SELECT slug, "coverImage" FROM "BlogPost" ORDER BY "createdAt";
