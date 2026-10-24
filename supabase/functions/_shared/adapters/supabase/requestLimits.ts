import { createClient } from "../../deps.ts";
import type { Database } from "../../database.types.ts";
import type { RequestLimits } from "../../ports/requestLimits.ts";
import { createRequestLimitHasher } from "../crypto/requestLimitHash.ts";

// Counting happens in eccia_consumir_limite: one atomic statement on database
// time, so concurrent instances share the budget and client clocks never move
// a window. Only the keyed digest leaves this process.
export const createSupabaseRequestLimits = (config: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly hashSecret: string;
}): RequestLimits => {
  const hash = createRequestLimitHasher(config.hashSecret);
  // A dedicated server client never adopts a browser/user session.
  const client = createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return {
    consume: async (key, policy) => {
      const { data, error } = await client.rpc("eccia_consumir_limite", {
        p_clave_hash: await hash(key),
        p_limite: policy.limit,
        p_ventana_segundos: policy.windowSeconds,
      });
      // Errors may echo the digest; report only that the store failed.
      if (error !== null) throw new Error("Request limit store unavailable");
      const [decision] = data ?? [];
      if (decision === undefined) {
        throw new Error("Request limit store returned no decision");
      }
      if (decision.allowed) return { allowed: true };
      if (
        !Number.isInteger(decision.retry_after_seconds) ||
        decision.retry_after_seconds < 1
      ) {
        throw new Error("Request limit store returned an invalid retry delay");
      }
      return {
        allowed: false,
        retryAfterSeconds: decision.retry_after_seconds,
      };
    },
  };
};
