/**
 * Credential Sync Orchestrator
 *
 * When credentials are saved in the dashboard, this module pushes them
 * to Vercel (env vars) and GitHub (Actions secrets) in parallel.
 *
 * Requires two bootstrap secrets set once:
 *   - VERCEL_API_TOKEN + VERCEL_PROJECT_ID  → enables Vercel sync
 *   - GITHUB_SYNC_PAT + GITHUB_REPO_OWNER + GITHUB_REPO_NAME → enables GitHub sync
 */

import { syncToVercel, removeFromVercel } from "./sync-vercel";
import { syncToGitHub, removeFromGitHub } from "./sync-github";

export interface SyncResults {
  vercel: { success: boolean; message: string; updated: string[]; errors: string[] };
  github: { success: boolean; message: string; updated: string[]; errors: string[] };
}

// Integration names whose credentials are meta/bootstrap and should NOT be
// synced outward (avoids circular pushes of tokens used for syncing itself).
const SKIP_SYNC_INTEGRATIONS = new Set(["SYNC_VERCEL", "SYNC_GITHUB"]);

/**
 * Returns true if the given integration name should have its credentials
 * synced to Vercel + GitHub when saved.
 */
export function shouldSync(integrationName: string): boolean {
  return !SKIP_SYNC_INTEGRATIONS.has(integrationName);
}

/**
 * Push a set of env vars to both Vercel and GitHub in parallel.
 */
export async function syncCredentials(
  envVars: Record<string, string>
): Promise<SyncResults> {
  const [vercel, github] = await Promise.all([
    syncToVercel(envVars),
    syncToGitHub(envVars),
  ]);
  return { vercel, github };
}

/**
 * Remove env vars from both Vercel and GitHub in parallel.
 */
export async function unsyncCredentials(
  envVarKeys: string[]
): Promise<SyncResults> {
  const [vercel, github] = await Promise.all([
    removeFromVercel(envVarKeys),
    removeFromGitHub(envVarKeys),
  ]);
  return { vercel, github };
}
