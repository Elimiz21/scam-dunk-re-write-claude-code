/**
 * The exact public Supabase URL used to construct the storage client.
 *
 * Keep this direct environment access in one place. Next.js replaces public
 * environment variables during the build, so write-target verification must
 * call this same accessor instead of reading a potentially different runtime
 * value.
 */
export function getConfiguredSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}
