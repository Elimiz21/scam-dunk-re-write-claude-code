-- These Prisma models are accessed through authenticated application servers.
-- No Supabase Auth UID policy is valid for the separate NextAuth identities.
-- Existing owner/service-role privileges are preserved; unknown policies stop rollout.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Prisma's own history table shares this server-only boundary.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM anon; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM authenticated; END IF;
  END IF;
  FOREACH table_name IN ARRAY ARRAY['User', 'AuthFunnelEvent', 'ConversionFunnelEvent', 'FeatureInterest', 'Account', 'Session', 'VerificationToken', 'EmailVerificationToken', 'PasswordResetToken', 'ScanUsage', 'WatchlistEntry', 'ActiveMonitor', 'MonitorExecution', 'NotificationDelivery', 'BillingEvent', 'WatchlistItem', 'WhatsAppIdentityBinding', 'WhatsAppInboundEvent', 'AdminUser', 'AdminSession', 'AdminInvite', 'ApiUsageLog', 'ApiCostAlert', 'IntegrationConfig', 'ScanHistory', 'ScanOperation', 'ModelMetrics', 'AdminAuditLog', 'TrackedStock', 'StockDailySnapshot', 'DailyScanSummary', 'EvaluationArtifactRevision', 'EvaluationArtifactPublicationHead', 'EvaluationArtifactObject', 'EvaluationIngestionPhase', 'StockRiskAlert', 'PromotedStock', 'AuthErrorLog', 'AuthErrorSummary', 'ScanMessage', 'ScanMessageHistory', 'ScanMessageGeneration', 'BlogPost', 'MediaMention', 'SupportTicket', 'SupportTicketResponse', 'SupportEmailRecipient', 'EmailLog', 'RegulatoryFlag', 'RegulatoryDatabaseSync', 'SocialScanRun', 'SocialMention', 'HomepageHero', 'BrowserAgentSession', 'BrowserEvidence', 'RateLimitEntry', 'BrowserPlatformConfig', 'Promoter', 'PromoterIdentity', 'PromoterStockLink', 'PromoterNetwork', 'pre_pump_watchlist', 'TelegramIdentityBinding', 'TelegramLinkToken', 'TelegramInboundEvent'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name) THEN
        RAISE EXCEPTION 'Review existing policies before restricting %', table_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
          EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

