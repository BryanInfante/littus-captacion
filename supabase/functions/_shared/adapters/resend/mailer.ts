import { DomainError } from "../../domain/errors.ts";
import type { Mailer, OperationalEmail } from "../../ports/mailer.ts";

// The only place that knows the Resend host. It sends operational email through
// /emails; promotional sends use Broadcasts and never pass through this port.
export const RESEND_API_URL = "https://api.resend.com";
// A hung provider must not hold the webhook open; the reconciler retries.
const TIMEOUT_MS = 10_000;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createResendMailer = (options: {
  readonly apiKey: string;
  readonly from: string;
  readonly replyTo: string;
  readonly fetch: Fetch;
}): Mailer => ({
  send: async (email: OperationalEmail) => {
    let response: Response;
    try {
      response = await options.fetch(`${RESEND_API_URL}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: options.from,
          to: [email.to.value],
          reply_to: options.replyTo,
          subject: email.subject,
          html: email.html,
          tags: email.tags,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // The cause can echo the API key or recipient; it is never kept.
      throw new DomainError("MAIL_DELIVERY_FAILED");
    }
    // Provider text can echo the recipient, so only the shape is inspected.
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body) || typeof body.id !== "string") {
      throw new DomainError("MAIL_DELIVERY_FAILED");
    }
    return { id: body.id };
  },
});
