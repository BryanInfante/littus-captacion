import { assertEquals } from "../dev_deps.ts";
import { TurnstileHumanChallenge } from "../../_shared/adapters/turnstile/humanChallenge.ts";
import { MemoryHumanChallenge } from "../../_shared/adapters/memory/humanChallenge.ts";
import type { LogEntry, Logger } from "../../_shared/log.ts";

// Cloudflare's documented test secrets; never production credentials.
const PASS_SECRET = "1x0000000000000000000000000000000AA";
const FAIL_SECRET = "2x0000000000000000000000000000000AA";
const TOKEN = "private-challenge-token";
const IP = "203.0.113.7";

const captureLogger = (entries: LogEntry[]): Logger => ({
  log: (requestId, fields) => {
    entries.push({ requestId, ...fields });
  },
});

const assertSafeLogs = (entries: readonly LogEntry[]) => {
  for (const entry of entries) {
    assertEquals(
      Object.keys(entry).every((key) =>
        ["requestId", "event", "status", "method", "path"].includes(key)
      ),
      true,
    );
  }
  for (const value of [PASS_SECRET, FAIL_SECRET, TOKEN, IP]) {
    assertEquals(JSON.stringify(entries).includes(value), false);
  }
};

Deno.test("Turnstile posts secret response and remoteip to siteverify with injected fetch", async () => {
  const requests: Request[] = [];
  const entries: LogEntry[] = [];
  const adapter = new TurnstileHumanChallenge({
    secretKey: PASS_SECRET,
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(Response.json({ success: true }));
    },
    logger: captureLogger(entries),
  });
  assertEquals(await adapter.verify(TOKEN, IP), true);
  assertEquals(requests.length, 1);
  const [request] = requests;
  if (request === undefined) throw new Error("Expected siteverify request");
  assertEquals(
    request.url,
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  );
  assertEquals(request.method, "POST");
  const body = await request.formData();
  assertEquals([...body.keys()].sort(), ["remoteip", "response", "secret"]);
  assertEquals(body.get("secret"), PASS_SECRET);
  assertEquals(body.get("response"), TOKEN);
  assertEquals(body.get("remoteip"), IP);
  assertSafeLogs(entries);
});

for (
  const scenario of [
    {
      name: "success false",
      response: () => Response.json({ success: false }),
    },
    { name: "missing success", response: () => Response.json({}) },
    {
      name: "truthy nonboolean success",
      response: () => Response.json({ success: "true" }),
    },
    { name: "null JSON", response: () => Response.json(null) },
    {
      name: "non-200",
      response: () => Response.json({ success: true }, { status: 503 }),
    },
    {
      name: "other 2xx",
      response: () => Response.json({ success: true }, { status: 201 }),
    },
    { name: "malformed JSON", response: () => new Response("{broken") },
    {
      name: "network error",
      response: (): Response => {
        throw new Error(`${FAIL_SECRET} ${TOKEN} ${IP}`);
      },
    },
  ]
) {
  Deno.test(`Turnstile fails closed on ${scenario.name} without logging sensitive values`, async () => {
    const entries: LogEntry[] = [];
    const adapter = new TurnstileHumanChallenge({
      secretKey: FAIL_SECRET,
      fetch: () => Promise.resolve(scenario.response()),
      logger: captureLogger(entries),
    });
    assertEquals(await adapter.verify(TOKEN, IP), false);
    assertSafeLogs(entries);
  });
}

Deno.test("memory human challenge has deterministic passing and failing modes", async () => {
  assertEquals(await new MemoryHumanChallenge(true).verify(TOKEN, IP), true);
  assertEquals(await new MemoryHumanChallenge(false).verify(TOKEN, IP), false);
});

Deno.test("Turnstile catches rejected fetch promises without logging the error", async () => {
  const entries: LogEntry[] = [];
  const adapter = new TurnstileHumanChallenge({
    secretKey: FAIL_SECRET,
    fetch: () => Promise.reject(new Error(`${FAIL_SECRET} ${TOKEN} ${IP}`)),
    logger: captureLogger(entries),
  });
  assertEquals(await adapter.verify(TOKEN, IP), false);
  assertSafeLogs(entries);
});

Deno.test("Turnstile omits optional remoteip for the shared unknown bucket", async () => {
  const requests: Request[] = [];
  const adapter = new TurnstileHumanChallenge({
    secretKey: PASS_SECRET,
    fetch: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(Response.json({ success: true }));
    },
    logger: captureLogger([]),
  });
  assertEquals(await adapter.verify(TOKEN, "unknown"), true);
  const [request] = requests;
  if (request === undefined) throw new Error("Expected siteverify request");
  assertEquals((await request.formData()).has("remoteip"), false);
});
