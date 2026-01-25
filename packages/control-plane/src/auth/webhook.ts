/**
 * GitHub webhook signature verification.
 *
 * Verifies that incoming webhooks are authentically from GitHub
 * using HMAC-SHA256 signature validation.
 */

/**
 * Verify GitHub webhook signature.
 *
 * @param payload - Raw request body as string
 * @param signature - X-Hub-Signature-256 header value
 * @param secret - Webhook secret configured in GitHub App
 * @returns true if signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    console.error("[webhook] Missing X-Hub-Signature-256 header");
    return false;
  }

  if (!signature.startsWith("sha256=")) {
    console.error("[webhook] Invalid signature format, expected sha256= prefix");
    return false;
  }

  try {
    const encoder = new TextEncoder();

    // Import the secret key for HMAC
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the payload
    const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

    // Convert to hex string
    const expectedSignature =
      "sha256=" +
      Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0;
  } catch (error) {
    console.error("[webhook] Signature verification error:", error);
    return false;
  }
}
