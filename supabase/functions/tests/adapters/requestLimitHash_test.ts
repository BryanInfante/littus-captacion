import { assertEquals } from "../dev_deps.ts";
import { createRequestLimitHasher } from "../../_shared/adapters/crypto/requestLimitHash.ts";

Deno.test("request limit key is HMAC-SHA-256 of a namespaced key, not an unkeyed digest", async () => {
  const secret = "fixture-request-limit-hash-secret-at-least-32-chars";
  const input = { kind: "email" as const, value: "person@example.invalid" };
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    bytes.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      bytes.encode(JSON.stringify([input.kind, input.value])),
    ),
  );
  const hex = [...expected].map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const hash = createRequestLimitHasher(secret);
  assertEquals(await hash(input), hex);
  assertEquals(await hash(input), await hash(input));
  assertEquals(/^[a-f0-9]{64}$/.test(await hash(input)), true);
  assertEquals(await hash({ ...input, kind: "ip" }) === hex, false);
  assertEquals(
    await createRequestLimitHasher(`${secret}-rotated`)(input) === hex,
    false,
  );
  assertEquals(
    await hash({ ...input, value: "other@example.invalid" }) === hex,
    false,
  );
});
