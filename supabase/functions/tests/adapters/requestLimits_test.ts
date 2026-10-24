import { assertEquals } from "../dev_deps.ts";
import { MemoryRequestLimits } from "../../_shared/adapters/memory/requestLimits.ts";
import { NOW } from "../fixtures/registration.ts";

Deno.test("memory request limits round retry seconds up without extending a denied window", async () => {
  let now = NOW.getTime();
  const limits = new MemoryRequestLimits(() => new Date(now));
  const key = { kind: "email" as const, value: "person@example.invalid" };
  const policy = { limit: 1, windowSeconds: 10 };
  assertEquals(await limits.consume(key, policy), { allowed: true });
  now += 1500;
  assertEquals(await limits.consume(key, policy), {
    allowed: false,
    retryAfterSeconds: 9,
  });
  now += 8499;
  assertEquals(await limits.consume(key, policy), {
    allowed: false,
    retryAfterSeconds: 1,
  });
  now += 1;
  assertEquals(await limits.consume(key, policy), { allowed: true });
});

Deno.test("memory request limits namespace IP and email keys even for identical values", async () => {
  const limits = new MemoryRequestLimits(() => NOW);
  const policy = { limit: 1, windowSeconds: 3600 };
  assertEquals(await limits.consume({ kind: "ip", value: "unknown" }, policy), {
    allowed: true,
  });
  assertEquals(
    await limits.consume({ kind: "email", value: "unknown" }, policy),
    { allowed: true },
  );
  assertEquals(
    (await limits.consume({ kind: "ip", value: "unknown" }, policy)).allowed,
    false,
  );
});
