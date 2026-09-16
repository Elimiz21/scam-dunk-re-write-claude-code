export interface SupabaseServiceConfig {
  supabaseUrl: string;
  serviceKey: string;
}

function projectRefFromUrl(url: URL): string | null {
  const suffix = ".supabase.co";
  if (!url.hostname.endsWith(suffix)) return null;
  const ref = url.hostname.slice(0, -suffix.length);
  return ref && !ref.includes(".") ? ref : null;
}

function parseLegacyJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function requireSupabaseServiceConfig(
  env: Readonly<Record<string, string | undefined>>,
): SupabaseServiceConfig {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!rawUrl || !serviceKey) {
    throw new Error(
      "Evaluation publication requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; public anonymous credentials are not accepted",
    );
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is invalid");
  }

  if (serviceKey.startsWith("sb_publishable_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY cannot be a publishable key");
  }
  if (serviceKey.startsWith("sb_secret_")) {
    if (serviceKey.length <= "sb_secret_".length) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY contains an invalid sb_secret_ key");
    }
    return { supabaseUrl: rawUrl.replace(/\/$/, ""), serviceKey };
  }

  const payload = parseLegacyJwtPayload(serviceKey);
  if (!payload || payload.role !== "service_role") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be an sb_secret_ key or a legacy JWT with role=service_role",
    );
  }
  const expectedRef = projectRefFromUrl(url);
  if (!expectedRef || payload.ref !== expectedRef) {
    throw new Error(
      "Legacy SUPABASE_SERVICE_ROLE_KEY project ref does not match NEXT_PUBLIC_SUPABASE_URL",
    );
  }
  if (
    typeof payload.exp === "number" &&
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Legacy SUPABASE_SERVICE_ROLE_KEY JWT is expired");
  }
  return { supabaseUrl: rawUrl.replace(/\/$/, ""), serviceKey };
}
