import { isClientIp } from "../../domain/requestLimits.ts";
import type { Logger } from "../../log.ts";
import type { HumanChallenge } from "../../ports/humanChallenge.ts";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// A hung verifier must not hold the request open; a timeout fails closed.
const TIMEOUT_MS = 5000;
// The port carries no request id; this constant tags verifier outages so they
// stay distinguishable from rejected tokens in the logs.
const LOG_REQUEST_ID = "turnstile-siteverify";

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export class TurnstileHumanChallenge implements HumanChallenge {
  constructor(
    private readonly options: {
      readonly secretKey: string;
      readonly fetch: Fetch;
      readonly logger: Logger;
    },
  ) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    const body = new URLSearchParams({
      secret: this.options.secretKey,
      response: token,
    });
    // remoteip is optional; the shared unknown bucket is not an address.
    if (isClientIp(remoteIp)) body.set("remoteip", remoteIp);
    let response: Response;
    try {
      response = await this.options.fetch(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // The error may echo the secret or token; it is never logged.
      this.unavailable();
      return false;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      this.unavailable(response.status);
      return false;
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      this.unavailable(response.status);
      return false;
    }
    // Only a literal true passes: a missing, truthy, or malformed field fails.
    return isRecord(result) && result.success === true;
  }

  private unavailable(status?: number): void {
    this.options.logger.log(LOG_REQUEST_ID, {
      event: "challenge.unavailable",
      ...(status === undefined ? {} : { status }),
    });
  }
}
