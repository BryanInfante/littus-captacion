import { timingSafeEqual } from "../deps.ts";
import { loadWebhookConfig } from "../config.ts";

export type WebhookHandler = (request: Request) => Response | Promise<Response>;
export type WebhookSecretProvider = () => string;

const HEADER_NAME = "x-eccia-webhook-secret";
const UTF8 = new TextEncoder();

const jsonResponse = (error: string, status: number): Response =>
  Response.json({ error }, { status });

export const withWebhookAuth = (
  handler: WebhookHandler,
  resolveSecret: WebhookSecretProvider = () =>
    loadWebhookConfig().webhookSecret,
): WebhookHandler =>
(request) => {
  let expectedSecret: string;
  try {
    expectedSecret = resolveSecret();
  } catch {
    return jsonResponse("SERVICE_UNAVAILABLE", 503);
  }

  if (expectedSecret.trim() === "") {
    return jsonResponse("SERVICE_UNAVAILABLE", 503);
  }

  const suppliedSecret = request.headers.get(HEADER_NAME);
  if (suppliedSecret === null || suppliedSecret.trim() === "") {
    return jsonResponse("UNAUTHORIZED", 401);
  }

  const expectedBytes = UTF8.encode(expectedSecret);
  const suppliedBytes = UTF8.encode(suppliedSecret);
  if (
    expectedBytes.byteLength !== suppliedBytes.byteLength ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return jsonResponse("UNAUTHORIZED", 401);
  }

  return handler(request);
};
