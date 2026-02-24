/**
 * Sync credentials to Vercel environment variables.
 * Uses the Vercel REST API to create/update env vars on save.
 */

export interface SyncResult {
  success: boolean;
  message: string;
  updated: string[];
  errors: string[];
}

interface VercelEnvVar {
  id: string;
  key: string;
  target: string[];
}

function getVercelConfig() {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!apiToken || !projectId) return null;
  return { apiToken, projectId, teamId: process.env.VERCEL_TEAM_ID || "" };
}

function vercelUrl(path: string, teamId?: string): string {
  const base = `https://api.vercel.com${path}`;
  return teamId ? `${base}?teamId=${teamId}` : base;
}

async function getExistingEnvVars(
  apiToken: string,
  projectId: string,
  teamId?: string
): Promise<Map<string, string>> {
  const res = await fetch(vercelUrl(`/v9/projects/${projectId}/env`, teamId), {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const map = new Map<string, string>();
  for (const env of (data.envs || []) as VercelEnvVar[]) {
    map.set(env.key, env.id);
  }
  return map;
}

/**
 * Push env vars to Vercel. Creates new vars or updates existing ones.
 * Type is always "encrypted" and targets both production + preview.
 */
export async function syncToVercel(
  envVars: Record<string, string>
): Promise<SyncResult> {
  const cfg = getVercelConfig();
  if (!cfg) {
    return {
      success: true,
      message: "Vercel sync skipped (not configured)",
      updated: [],
      errors: [],
    };
  }

  const updated: string[] = [];
  const errors: string[] = [];
  const headers = {
    Authorization: `Bearer ${cfg.apiToken}`,
    "Content-Type": "application/json",
  };

  try {
    const existing = await getExistingEnvVars(
      cfg.apiToken,
      cfg.projectId,
      cfg.teamId
    );

    for (const [key, value] of Object.entries(envVars)) {
      try {
        const existingId = existing.get(key);

        if (existingId) {
          // Update
          const res = await fetch(
            vercelUrl(
              `/v9/projects/${cfg.projectId}/env/${existingId}`,
              cfg.teamId
            ),
            {
              method: "PATCH",
              headers,
              body: JSON.stringify({ value }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            errors.push(
              `${key}: ${(err as Record<string, Record<string, string>>).error?.message || res.status}`
            );
            continue;
          }
        } else {
          // Create
          const res = await fetch(
            vercelUrl(`/v10/projects/${cfg.projectId}/env`, cfg.teamId),
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                key,
                value,
                type: "encrypted",
                target: ["production", "preview"],
              }),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            errors.push(
              `${key}: ${(err as Record<string, Record<string, string>>).error?.message || res.status}`
            );
            continue;
          }
        }
        updated.push(key);
      } catch (e) {
        errors.push(
          `${key}: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    }
  } catch (e) {
    return {
      success: false,
      message: `Vercel sync failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      updated,
      errors,
    };
  }

  return {
    success: errors.length === 0,
    message:
      errors.length === 0
        ? `Synced ${updated.length} var(s) to Vercel`
        : `Synced ${updated.length}, ${errors.length} error(s)`,
    updated,
    errors,
  };
}

/**
 * Remove env vars from Vercel by key name.
 */
export async function removeFromVercel(
  envVarKeys: string[]
): Promise<SyncResult> {
  const cfg = getVercelConfig();
  if (!cfg) {
    return {
      success: true,
      message: "Vercel sync skipped (not configured)",
      updated: [],
      errors: [],
    };
  }

  const updated: string[] = [];
  const errors: string[] = [];

  try {
    const existing = await getExistingEnvVars(
      cfg.apiToken,
      cfg.projectId,
      cfg.teamId
    );

    for (const key of envVarKeys) {
      const existingId = existing.get(key);
      if (!existingId) continue;

      try {
        const res = await fetch(
          vercelUrl(
            `/v9/projects/${cfg.projectId}/env/${existingId}`,
            cfg.teamId
          ),
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${cfg.apiToken}` },
          }
        );
        if (res.ok) {
          updated.push(key);
        } else {
          errors.push(`${key}: DELETE failed (${res.status})`);
        }
      } catch (e) {
        errors.push(
          `${key}: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    }
  } catch (e) {
    return {
      success: false,
      message: `Vercel removal failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      updated,
      errors,
    };
  }

  return {
    success: errors.length === 0,
    message: `Removed ${updated.length} var(s) from Vercel`,
    updated,
    errors,
  };
}
