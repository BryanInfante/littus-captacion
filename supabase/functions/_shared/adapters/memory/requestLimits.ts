import type { RequestLimitPolicy } from "../../domain/requestLimits.ts";
import type {
  RequestLimitDecision,
  RequestLimitKey,
  RequestLimits,
} from "../../ports/requestLimits.ts";

type Window = { attempts: number; readonly expiresAt: number };

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 1;

// Mirrors eccia_consumir_limite: fixed windows from the first attempt,
// rejections never extend a window, expired windows are dropped on consume.
export class MemoryRequestLimits implements RequestLimits {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly now: () => Date) {}

  consume(
    key: RequestLimitKey,
    policy: RequestLimitPolicy,
  ): Promise<RequestLimitDecision> {
    if (
      !isPositiveInteger(policy.limit) ||
      !isPositiveInteger(policy.windowSeconds)
    ) {
      return Promise.reject(new RangeError("Invalid request limit policy"));
    }
    const now = this.now().getTime();
    for (const [id, window] of this.windows) {
      if (window.expiresAt <= now) this.windows.delete(id);
    }
    // No await between read and write: concurrent calls cannot both pass,
    // matching the database's single-statement upsert.
    const id = JSON.stringify([key.kind, key.value]);
    const window = this.windows.get(id);
    if (window === undefined) {
      this.windows.set(id, {
        attempts: 1,
        expiresAt: now + policy.windowSeconds * 1000,
      });
      return Promise.resolve({ allowed: true });
    }
    if (window.attempts < policy.limit) {
      window.attempts += 1;
      return Promise.resolve({ allowed: true });
    }
    return Promise.resolve({
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((window.expiresAt - now) / 1000),
      ),
    });
  }
}
