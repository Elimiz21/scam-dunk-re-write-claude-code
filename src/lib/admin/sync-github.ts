/**
 * Sync credentials to GitHub Actions repository secrets.
 * Uses the GitHub REST API + libsodium sealed-box encryption.
 */

import sodium from "libsodium-wrappers";

export interface SyncResult {
  success: boolean;
  message: string;
  updated: string[];
  errors: string[];
}

function getGitHubConfig() {
  const pat = process.env.GITHUB_SYNC_PAT;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  if (!pat || !owner || !repo) return null;
  return { pat, owner, repo };
}

function githubHeaders(pat: string) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getRepoPublicKey(
  pat: string,
  owner: string,
  repo: string
): Promise<{ key_id: string; key: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: githubHeaders(pat) }
  );
  if (!res.ok)
    throw new Error(`GitHub API error getting public key: ${res.status}`);
  return res.json();
}

/**
 * Encrypt a secret value using the repo's public key (libsodium sealed box).
 * This is the format GitHub requires for creating/updating secrets.
 */
async function encryptSecret(
  value: string,
  publicKeyB64: string
): Promise<string> {
  await sodium.ready;
  const keyBytes = sodium.from_base64(
    publicKeyB64,
    sodium.base64_variants.ORIGINAL
  );
  const messageBytes = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(messageBytes, keyBytes);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

/**
 * Push secrets to GitHub Actions. Creates or updates each secret.
 */
export async function syncToGitHub(
  envVars: Record<string, string>
): Promise<SyncResult> {
  const cfg = getGitHubConfig();
  if (!cfg) {
    return {
      success: true,
      message: "GitHub sync skipped (not configured)",
      updated: [],
      errors: [],
    };
  }

  const updated: string[] = [];
  const errors: string[] = [];

  try {
    const { key_id, key } = await getRepoPublicKey(
      cfg.pat,
      cfg.owner,
      cfg.repo
    );

    for (const [secretName, value] of Object.entries(envVars)) {
      try {
        const encrypted = await encryptSecret(value, key);
        const res = await fetch(
          `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/secrets/${secretName}`,
          {
            method: "PUT",
            headers: githubHeaders(cfg.pat),
            body: JSON.stringify({ encrypted_value: encrypted, key_id }),
          }
        );
        if (res.ok || res.status === 201 || res.status === 204) {
          updated.push(secretName);
        } else {
          const err = await res.json().catch(() => ({}));
          errors.push(
            `${secretName}: ${(err as Record<string, string>).message || res.status}`
          );
        }
      } catch (e) {
        errors.push(
          `${secretName}: ${e instanceof Error ? e.message : "Unknown error"}`
        );
      }
    }
  } catch (e) {
    return {
      success: false,
      message: `GitHub sync failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      updated,
      errors,
    };
  }

  return {
    success: errors.length === 0,
    message:
      errors.length === 0
        ? `Synced ${updated.length} secret(s) to GitHub`
        : `Synced ${updated.length}, ${errors.length} error(s)`,
    updated,
    errors,
  };
}

/**
 * Remove secrets from GitHub Actions by name.
 */
export async function removeFromGitHub(
  secretNames: string[]
): Promise<SyncResult> {
  const cfg = getGitHubConfig();
  if (!cfg) {
    return {
      success: true,
      message: "GitHub sync skipped (not configured)",
      updated: [],
      errors: [],
    };
  }

  const updated: string[] = [];
  const errors: string[] = [];

  for (const name of secretNames) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/secrets/${name}`,
        { method: "DELETE", headers: githubHeaders(cfg.pat) }
      );
      if (res.ok || res.status === 204) {
        updated.push(name);
      } else {
        errors.push(`${name}: DELETE failed (${res.status})`);
      }
    } catch (e) {
      errors.push(
        `${name}: ${e instanceof Error ? e.message : "Unknown error"}`
      );
    }
  }

  return {
    success: errors.length === 0,
    message: `Removed ${updated.length} secret(s) from GitHub`,
    updated,
    errors,
  };
}
