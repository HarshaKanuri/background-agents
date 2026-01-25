/**
 * Callback handlers for control-plane notifications.
 */

import { Hono } from "hono";
import type { Env, CompletionCallback } from "./types";
import { extractAgentResponse } from "./completion/extractor";
import { buildCompletionBlocks, getFallbackText } from "./completion/blocks";
import { postMessage } from "./utils/slack-client";

/**
 * Verify internal callback signature using shared secret.
 * Prevents external callers from forging completion callbacks.
 */
async function verifyCallbackSignature(
  payload: CompletionCallback,
  secret: string
): Promise<boolean> {
  const { signature, ...data } = payload;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureData = encoder.encode(JSON.stringify(data));
  const expectedSig = await crypto.subtle.sign("HMAC", key, signatureData);
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return signature === expectedHex;
}

/**
 * Validate callback payload shape.
 */
function isValidPayload(payload: unknown): payload is CompletionCallback {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.sessionId === "string" &&
    typeof p.messageId === "string" &&
    typeof p.success === "boolean" &&
    typeof p.timestamp === "number" &&
    typeof p.signature === "string" &&
    p.context !== null &&
    typeof p.context === "object" &&
    typeof (p.context as Record<string, unknown>).channel === "string" &&
    typeof (p.context as Record<string, unknown>).threadTs === "string"
  );
}

export const callbacksRouter = new Hono<{ Bindings: Env }>();

/**
 * Callback endpoint for session completion notifications.
 */
callbacksRouter.post("/complete", async (c) => {
  const payload = await c.req.json();

  // Validate payload shape
  if (!isValidPayload(payload)) {
    console.error("Invalid callback payload shape");
    return c.json({ error: "invalid payload" }, 400);
  }

  // Verify signature (prevents external forgery)
  if (!c.env.INTERNAL_CALLBACK_SECRET) {
    console.error("INTERNAL_CALLBACK_SECRET not configured");
    return c.json({ error: "not configured" }, 500);
  }

  const isValid = await verifyCallbackSignature(payload, c.env.INTERNAL_CALLBACK_SECRET);
  if (!isValid) {
    console.error("Invalid callback signature");
    return c.json({ error: "unauthorized" }, 401);
  }

  // Process in background
  c.executionCtx.waitUntil(handleCompletionCallback(payload, c.env));

  return c.json({ ok: true });
});

/**
 * Handle completion callback - fetch events and post to Slack.
 */
async function handleCompletionCallback(payload: CompletionCallback, env: Env): Promise<void> {
  const { sessionId, context } = payload;

  try {
    // Fetch events to build response (filtered by messageId directly)
    const agentResponse = await extractAgentResponse(env, sessionId, payload.messageId);

    // Check if extraction succeeded (has content or was explicitly successful)
    if (!agentResponse.textContent && agentResponse.toolCalls.length === 0 && !payload.success) {
      console.error("Failed to extract agent response, posting error message");
      await postMessage(
        env.SLACK_BOT_TOKEN,
        context.channel,
        "The agent completed but I couldn't retrieve the response. Please check the web UI for details.",
        {
          thread_ts: context.threadTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: ":warning: The agent completed but I couldn't retrieve the response.",
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View Session" },
                  url: `${env.WEB_APP_URL}/session/${sessionId}`,
                  action_id: "view_session",
                },
              ],
            },
          ],
        }
      );
      return;
    }

    // Build and post completion message
    const blocks = buildCompletionBlocks(sessionId, agentResponse, context, env.WEB_APP_URL);

    await postMessage(env.SLACK_BOT_TOKEN, context.channel, getFallbackText(agentResponse), {
      thread_ts: context.threadTs,
      blocks,
    });

    console.log(`Posted completion message for session ${sessionId}`);
  } catch (error) {
    console.error("Error handling completion callback:", error);
    // Don't throw - this is fire-and-forget
  }
}
