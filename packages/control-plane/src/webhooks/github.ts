/**
 * GitHub webhook handlers.
 */

import type { Env } from "../types";

/**
 * Verify GitHub webhook signature.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  const expectedSignature =
    "sha256=" +
    Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return signature === expectedSignature;
}

/**
 * Extract session ID from branch name.
 *
 * Branch naming convention: open-inspect/{session-id}
 */
export function extractSessionFromBranch(branchName: string): string | null {
  const match = branchName.match(/^open-inspect\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

/**
 * Handle push event.
 */
export async function handlePushEvent(payload: PushEventPayload, env: Env): Promise<void> {
  const sessionId = extractSessionFromBranch(payload.ref.replace("refs/heads/", ""));
  if (!sessionId) return;

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  await stub.fetch(
    new Request("http://internal/internal/sandbox-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "git_sync",
        status: "completed",
        sha: payload.after,
        sandboxId: "webhook",
        timestamp: Date.now(),
      }),
    })
  );
}

/**
 * Handle pull request event.
 */
export async function handlePullRequestEvent(
  payload: PullRequestEventPayload,
  env: Env
): Promise<void> {
  const sessionId = extractSessionFromBranch(payload.pull_request.head.ref);
  if (!sessionId) return;

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  // Update PR artifact
  await stub.fetch(
    new Request("http://internal/internal/sandbox-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "artifact",
        artifactType: "pr",
        url: payload.pull_request.html_url,
        metadata: {
          number: payload.pull_request.number,
          state: payload.pull_request.state,
          merged: payload.pull_request.merged,
          action: payload.action,
        },
        sandboxId: "webhook",
        timestamp: Date.now(),
      }),
    })
  );
}

/**
 * Handle pull request review comment event.
 */
export async function handlePullRequestReviewCommentEvent(
  payload: PullRequestReviewCommentPayload,
  env: Env
): Promise<void> {
  const sessionId = extractSessionFromBranch(payload.pull_request.head.ref);
  if (!sessionId) return;

  const doId = env.SESSION.idFromName(sessionId);
  const stub = env.SESSION.get(doId);

  // Format review comment as a prompt
  const promptContent = formatReviewComment(payload);

  await stub.fetch(
    new Request("http://internal/internal/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: promptContent,
        authorId: `github:${payload.comment.user.id}`,
        source: "github",
      }),
    })
  );
}

/**
 * Format review comment as an agent prompt.
 */
function formatReviewComment(payload: PullRequestReviewCommentPayload): string {
  const { comment } = payload;

  return `GitHub review comment from @${comment.user.login}:

File: ${comment.path}
Line: ${comment.line ?? comment.original_line ?? "unknown"}

\`\`\`diff
${comment.diff_hunk}
\`\`\`

Comment:
${comment.body}

Please address this review feedback.`;
}

// Payload types

interface PushEventPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    full_name: string;
  };
}

interface PullRequestEventPayload {
  action: string;
  pull_request: {
    number: number;
    state: string;
    merged: boolean;
    html_url: string;
    head: {
      ref: string;
    };
  };
}

interface PullRequestReviewCommentPayload {
  action: string;
  comment: {
    id: number;
    body: string;
    path: string;
    line: number | null;
    original_line: number | null;
    diff_hunk: string;
    user: {
      id: number;
      login: string;
    };
  };
  pull_request: {
    head: {
      ref: string;
    };
  };
}
