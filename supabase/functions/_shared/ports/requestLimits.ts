import type { RequestLimitPolicy } from "../domain/requestLimits.ts";

export type RequestLimitKey = {
  readonly kind: "email" | "ip";
  readonly value: string;
};

export type RequestLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface RequestLimits {
  // Counts one attempt against the key's window and decides atomically.
  consume(
    key: RequestLimitKey,
    policy: RequestLimitPolicy,
  ): Promise<RequestLimitDecision>;
}
