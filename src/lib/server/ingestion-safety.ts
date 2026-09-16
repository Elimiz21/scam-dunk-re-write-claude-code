import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const PRODUCTION_SUPABASE_PROJECT_REF = "gwzcluijtbuglznwdqqk";
export const PRODUCTION_VERCEL_PROJECT_ID =
  "prj_U6Fd6Lch5b39VS27foWZGUzqTmQS";

type Environment = Record<string, string | undefined>;

type IdentityFailureCode =
  | "DEPLOYMENT_MISMATCH"
  | "EXPECTED_PREVIEW_REF_MISSING"
  | "PREVIEW_TARGETS_PRODUCTION"
  | "LOCAL_FIXTURE_REQUIRED"
  | "UNPARSEABLE_IDENTITY"
  | "PROJECT_MISMATCH";

export type IngestionTargetVerification =
  | { ok: true; projectRef: string }
  | { ok: false; code: IdentityFailureCode };

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function databaseProjectRef(value: string | undefined): string | null {
  const url = parseUrl(value);
  if (!url || !["postgres:", "postgresql:"].includes(url.protocol)) {
    return null;
  }

  const directMatch = url.hostname.match(
    /^db\.([a-z0-9]{20})\.supabase\.co$/,
  );
  if (directMatch) return directMatch[1];

  if (!url.hostname.endsWith(".pooler.supabase.com")) return null;
  let username: string;
  try {
    username = decodeURIComponent(url.username);
  } catch {
    return null;
  }
  const poolerMatch = username.match(/^postgres\.([a-z0-9]{20})$/);
  return poolerMatch?.[1] ?? null;
}

function storageProjectRef(value: string | undefined): string | null {
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:") return null;
  return url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? null;
}

function isLoopbackUrl(value: string | undefined, protocols: string[]): boolean {
  const url = parseUrl(value);
  return Boolean(
    url && protocols.includes(url.protocol) && LOOPBACK_HOSTS.has(url.hostname),
  );
}

export function verifyIngestionTarget(
  env: Environment = process.env,
): IngestionTargetVerification {
  const vercelEnv = env.VERCEL_ENV;

  if (vercelEnv === "production" || vercelEnv === "preview") {
    if (env.VERCEL_PROJECT_ID !== PRODUCTION_VERCEL_PROJECT_ID) {
      return { ok: false, code: "DEPLOYMENT_MISMATCH" };
    }

    if (
      vercelEnv === "preview" &&
      env.EXPECTED_PREVIEW_SUPABASE_PROJECT_REF ===
        PRODUCTION_SUPABASE_PROJECT_REF
    ) {
      return { ok: false, code: "PREVIEW_TARGETS_PRODUCTION" };
    }

    const expectedRef =
      vercelEnv === "production"
        ? PRODUCTION_SUPABASE_PROJECT_REF
        : env.EXPECTED_PREVIEW_SUPABASE_PROJECT_REF;
    if (!expectedRef || !PROJECT_REF_PATTERN.test(expectedRef)) {
      return { ok: false, code: "EXPECTED_PREVIEW_REF_MISSING" };
    }

    const databaseRef = databaseProjectRef(env.DATABASE_URL);
    const storageRef = storageProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
    if (!databaseRef || !storageRef) {
      return { ok: false, code: "UNPARSEABLE_IDENTITY" };
    }
    if (databaseRef !== expectedRef || storageRef !== expectedRef) {
      return { ok: false, code: "PROJECT_MISMATCH" };
    }
    return { ok: true, projectRef: expectedRef };
  }

  if (vercelEnv !== undefined && vercelEnv !== "development") {
    return { ok: false, code: "LOCAL_FIXTURE_REQUIRED" };
  }
  if (env.INGESTION_LOCAL_FIXTURE !== "true") {
    return { ok: false, code: "LOCAL_FIXTURE_REQUIRED" };
  }
  if (
    !isLoopbackUrl(env.DATABASE_URL, ["postgres:", "postgresql:"]) ||
    !isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL, ["http:", "https:"])
  ) {
    return { ok: false, code: "UNPARSEABLE_IDENTITY" };
  }
  return { ok: true, projectRef: "local-fixture" };
}

export function cronAuthorizationFailure(
  request: Request,
  expectedSecret = process.env.CRON_SECRET,
): NextResponse | null {
  if (!expectedSecret) return unauthorizedCronResponse();

  const suppliedBytes = Buffer.from(
    request.headers.get("authorization") ?? "",
    "utf8",
  );
  const expectedBytes = Buffer.from(`Bearer ${expectedSecret}`, "utf8");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return unauthorizedCronResponse();
  }
  return null;
}

function unauthorizedCronResponse(): NextResponse {
  return NextResponse.json(
    {
      error: { code: "UNAUTHORIZED", message: "Invalid cron credentials." },
    },
    { status: 401 },
  );
}

export function unsafeIngestionTargetResponse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "UNSAFE_INGESTION_TARGET",
        message: "Ingestion target identity could not be verified.",
      },
    },
    { status: 503 },
  );
}
