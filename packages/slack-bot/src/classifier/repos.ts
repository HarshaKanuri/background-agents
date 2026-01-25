/**
 * Dynamic repository fetching from the control plane.
 *
 * This module replaces the static REPO_REGISTRY with dynamic fetching
 * from the control plane's GET /repos endpoint, which queries the
 * GitHub App installation to get the list of accessible repositories.
 */

import type { Env, RepoConfig, ControlPlaneRepo, ControlPlaneReposResponse } from "../types";
import { normalizeRepoId } from "../utils/repo";
import { generateInternalToken } from "../utils/internal";

/**
 * Fallback repositories if the control plane is unreachable.
 * This ensures the bot doesn't completely break during outages.
 */
const FALLBACK_REPOS: RepoConfig[] = [];

/**
 * Local cache TTL in milliseconds (1 minute).
 * This is shorter than the control plane's 5-minute cache because
 * the slack-bot might be restarted more frequently.
 */
const LOCAL_CACHE_TTL_MS = 60 * 1000;

/**
 * Local in-memory cache for repos.
 */
let localCache: {
  repos: RepoConfig[];
  timestamp: number;
} | null = null;

/**
 * Convert a control plane repo to a RepoConfig.
 * Normalizes identifiers to lowercase for consistent comparison.
 */
function toRepoConfig(repo: ControlPlaneRepo): RepoConfig {
  const normalizedOwner = repo.owner.toLowerCase();
  const normalizedName = repo.name.toLowerCase();

  return {
    id: normalizeRepoId(repo.owner, repo.name),
    owner: normalizedOwner,
    name: normalizedName,
    fullName: `${normalizedOwner}/${normalizedName}`,
    displayName: repo.name, // Keep original casing for display
    description: repo.metadata?.description || repo.description || repo.name,
    defaultBranch: repo.defaultBranch,
    private: repo.private,
    aliases: repo.metadata?.aliases,
    keywords: repo.metadata?.keywords,
    channelAssociations: repo.metadata?.channelAssociations,
  };
}

/**
 * Fetch available repositories from the control plane.
 *
 * This function:
 * 1. Checks local in-memory cache first
 * 2. Calls the control plane GET /repos endpoint
 * 3. Falls back to FALLBACK_REPOS if the API fails
 *
 * @param env - Cloudflare Worker environment
 * @returns Array of RepoConfig objects
 */
export async function getAvailableRepos(env: Env): Promise<RepoConfig[]> {
  // Check local cache first
  if (localCache && Date.now() - localCache.timestamp < LOCAL_CACHE_TTL_MS) {
    return localCache.repos;
  }

  try {
    // Use service binding if available, otherwise fall back to HTTP fetch
    let response: Response;

    // Build headers with auth token if secret is configured
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (env.INTERNAL_CALLBACK_SECRET) {
      const authToken = await generateInternalToken(env.INTERNAL_CALLBACK_SECRET);
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    if (env.CONTROL_PLANE) {
      response = await env.CONTROL_PLANE.fetch("https://internal/repos", {
        headers,
      });
    } else {
      const url = `${env.CONTROL_PLANE_URL}/repos`;
      response = await fetch(url, {
        headers: {
          ...headers,
          "User-Agent": "open-inspect-slack-bot",
        },
      });
    }

    if (!response.ok) {
      console.error(`Failed to fetch repos from control plane: ${response.status}`);
      return getFromCacheOrFallback(env);
    }

    const data = (await response.json()) as ControlPlaneReposResponse;
    const repos = data.repos.map(toRepoConfig);

    // Update local cache
    localCache = {
      repos,
      timestamp: Date.now(),
    };

    // Also store in KV for persistence across worker restarts
    try {
      await env.SLACK_KV.put("repos:cache", JSON.stringify(repos), {
        expirationTtl: 300, // 5 minutes
      });
    } catch (e) {
      console.warn("Failed to persist repos to KV:", e);
    }

    return repos;
  } catch (e) {
    console.error("Error fetching repos from control plane:", e);
    return getFromCacheOrFallback(env);
  }
}

/**
 * Get repos from KV cache or return fallback.
 */
async function getFromCacheOrFallback(env: Env): Promise<RepoConfig[]> {
  try {
    const cached = await env.SLACK_KV.get("repos:cache", "json");
    if (cached && Array.isArray(cached)) {
      console.log("Using cached repos from KV");
      return cached as RepoConfig[];
    }
  } catch (e) {
    console.warn("Failed to read repos from KV cache:", e);
  }

  console.warn("Using fallback repos (control plane unavailable)");
  if (FALLBACK_REPOS.length === 0) {
    console.error(
      "CRITICAL: No fallback repos configured and control plane is unavailable. " +
        "Bot will not be able to process requests until control plane is restored."
    );
  }
  return FALLBACK_REPOS;
}

/**
 * Find a repository by owner and name.
 */
export async function getRepoByFullName(
  env: Env,
  fullName: string
): Promise<RepoConfig | undefined> {
  const repos = await getAvailableRepos(env);
  return repos.find((r) => r.fullName.toLowerCase() === fullName.toLowerCase());
}

/**
 * Find a repository by its ID.
 */
export async function getRepoById(env: Env, id: string): Promise<RepoConfig | undefined> {
  const repos = await getAvailableRepos(env);
  return repos.find((r) => r.id.toLowerCase() === id.toLowerCase());
}

/**
 * Find repositories associated with a Slack channel.
 */
export async function getReposByChannel(env: Env, channelId: string): Promise<RepoConfig[]> {
  const repos = await getAvailableRepos(env);
  return repos.filter((r) => r.channelAssociations?.includes(channelId));
}

/**
 * Build a description string for all available repos.
 * Used in the classification prompt.
 */
export async function buildRepoDescriptions(env: Env): Promise<string> {
  const repos = await getAvailableRepos(env);

  if (repos.length === 0) {
    return "No repositories are currently available.";
  }

  return repos
    .map(
      (repo) => `
- **${repo.id}** (${repo.fullName})
  - Description: ${repo.description}
  - Also known as: ${repo.aliases?.join(", ") || "N/A"}
  - Keywords: ${repo.keywords?.join(", ") || "N/A"}
  - Default branch: ${repo.defaultBranch}
  - Private: ${repo.private ? "Yes" : "No"}`
    )
    .join("\n");
}

/**
 * Clear local cache (for testing or forced refresh).
 */
export function clearLocalCache(): void {
  localCache = null;
}
