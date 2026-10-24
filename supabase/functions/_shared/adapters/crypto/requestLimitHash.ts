import type { RequestLimitKey } from "../../ports/requestLimits.ts";

// A keyed digest, not a plain hash: emails and IPs are low-entropy, so an
// unkeyed digest stored in the database could be reversed by enumeration.
export const createRequestLimitHasher = (
  secret: string,
): (key: RequestLimitKey) => Promise<string> => {
  if (secret.length === 0) {
    throw new Error("Request limit hash secret is empty");
  }
  const encoder = new TextEncoder();
  // Imported on first use so a failure surfaces in a request, never as an
  // unhandled rejection at boot.
  let hmacKey: Promise<CryptoKey> | undefined;
  return async (key) => {
    hmacKey ??= crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    // The kind is part of the input, so an email and an IP never share a key.
    const signature = await crypto.subtle.sign(
      "HMAC",
      await hmacKey,
      encoder.encode(JSON.stringify([key.kind, key.value])),
    );
    return Array.from(
      new Uint8Array(signature),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  };
};
