import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceConfig } from "@/lib/server/supabase-service-config";

let cachedClient: SupabaseClient | null = null;

export function getEvaluationStorageServerClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SupabaseClient {
  const { supabaseUrl, serviceKey } = requireSupabaseServiceConfig(env);
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}
