-- These tables are accessed by the server-side Prisma role only. Keep them
-- protected if they are ever granted to a Supabase Data API role later.
ALTER TABLE public."FeatureInterest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WatchlistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WhatsAppIdentityBinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WhatsAppInboundEvent" ENABLE ROW LEVEL SECURITY;
