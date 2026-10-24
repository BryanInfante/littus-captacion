import { assertEquals } from "../dev_deps.ts";
import { createHandler } from "../../public-api/index.ts";
import { createLogger } from "../../_shared/log.ts";
import type { LogEntry } from "../../_shared/log.ts";
import type { RegistrationDetails } from "../../_shared/domain/registration.ts";
import type { Registrations } from "../../_shared/ports/registrations.ts";
import { memoryPorts, NOW, openEvent } from "../fixtures/registration.ts";
import { MemoryHumanChallenge } from "../../_shared/adapters/memory/humanChallenge.ts";
import { MemoryRequestLimits } from "../../_shared/adapters/memory/requestLimits.ts";
import type { HumanChallenge } from "../../_shared/ports/humanChallenge.ts";
import type { RequestLimits } from "../../_shared/ports/requestLimits.ts";

const ORIGIN = "https://site.example.invalid";
const ROUTE =
  "https://edge.example.invalid/functions/v1/public-api/registrations";
const validBody = {
  event_code: openEvent().code,
  nombre: "Private Test Person",
  correo: " PRIVATE.PERSON@Example.Invalid ",
  challenge_token: "private-challenge-token",
};

const request = (body: unknown = validBody, origin: string | null = ORIGIN) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== null) headers.set("origin", origin);
  return new Request(ROUTE, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

const setup = (options: {
  closed?: boolean;
  registrations?: Registrations;
  humanChallenge?: HumanChallenge;
  requestLimits?: RequestLimits;
} = {}) => {
  const ports = memoryPorts([
    openEvent(options.closed ? { registrationClosesAt: NOW } : {}),
  ]);
  const stored: Awaited<ReturnType<Registrations["create"]>>[] = [];
  const entries: Readonly<Record<string, unknown>>[] = [];
  const registrations: Registrations = options.registrations ?? {
    create: async (input: RegistrationDetails) => {
      const result = await ports.registrations.create(input);
      stored.push(result);
      return result;
    },
  };
  const handler = createHandler({
    events: ports.events,
    registrations,
    humanChallenge: options.humanChallenge ?? new MemoryHumanChallenge(true),
    requestLimits: options.requestLimits ?? new MemoryRequestLimits(() => NOW),
    now: () => NOW,
    publicSiteUrl: ORIGIN,
    logger: createLogger((entry: LogEntry) => entries.push(entry)),
    requestId: () => "request-fixture-001",
  });
  return { handler, stored, entries };
};

Deno.test("public-api returns only id and event_code with 201 and stores normalized email", async () => {
  const { handler, stored } = setup();
  const response = await handler(
    request({ ...validBody, marketing_consent: true }),
  );
  assertEquals(response.status, 201);
  assertEquals(stored.length, 1);
  const [created] = stored;
  if (created === undefined) throw new Error("Expected a stored registration");
  assertEquals(await response.json(), {
    id: created.id,
    event_code: openEvent().code,
  });
  assertEquals(created.email.value, "private.person@example.invalid");
  assertEquals(created.marketingConsent, true);
});

Deno.test("public-api defaults omitted marketing consent to false", async () => {
  const { handler, stored } = setup();
  const response = await handler(request());
  await response.text();
  assertEquals(response.status, 201);
  assertEquals(stored.map((row) => row.marketingConsent), [false]);
});

Deno.test("public-api preserves explicit false marketing consent", async () => {
  const { handler, stored } = setup();
  const response = await handler(
    request({ ...validBody, marketing_consent: false }),
  );
  await response.text();
  assertEquals(response.status, 201);
  assertEquals(stored.map((row) => row.marketingConsent), [false]);
});

Deno.test("public-api rejects malformed JSON with 400 without writing", async () => {
  const { handler, stored } = setup();
  const response = await handler(
    new Request(ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: "{broken",
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "INVALID_INPUT" });
  assertEquals(stored, []);
});

Deno.test("public-api rejects invalid body shapes and field boundaries with 400", async () => {
  const invalidBodies: unknown[] = [
    null,
    [],
    "text",
    {},
    { ...validBody, event_code: "ab" },
    { ...validBody, event_code: "e".repeat(81) },
    { ...validBody, event_code: 42 },
    { ...validBody, nombre: " " },
    { ...validBody, nombre: "n".repeat(121) },
    { ...validBody, nombre: 42 },
    { ...validBody, correo: "invalid" },
    { ...validBody, correo: null },
    { ...validBody, marketing_consent: "false" },
    { ...validBody, marketing_consent: null },
    { ...validBody, marketing_consent: 1 },
  ];
  for (const body of invalidBodies) {
    const { handler, stored } = setup();
    const response = await handler(request(body));
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "INVALID_INPUT" });
    assertEquals(stored, []);
  }
});

Deno.test("public-api maps unknown event to 404", async () => {
  const { handler, stored } = setup();
  const response = await handler(
    request({ ...validBody, event_code: "unknown-event" }),
  );
  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "EVENT_NOT_FOUND" });
  assertEquals(stored, []);
});

Deno.test("public-api maps a normalized duplicate to 409", async () => {
  const { handler, stored } = setup();
  const first = await handler(request());
  await first.text();
  assertEquals(first.status, 201);
  const duplicate = await handler(
    request({ ...validBody, correo: "private.person@example.invalid" }),
  );
  assertEquals(duplicate.status, 409);
  assertEquals(await duplicate.json(), { error: "ALREADY_REGISTERED" });
  assertEquals(stored.length, 1);
});

Deno.test("public-api maps registration closed to 409 using the injected clock", async () => {
  const { handler, stored } = setup({ closed: true });
  const response = await handler(request());
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "REGISTRATION_CLOSED" });
  assertEquals(stored, []);
});

Deno.test("public-api restricts CORS to the exact configured origin including errors", async () => {
  for (
    const origin of [
      ORIGIN,
      "https://evil.example.invalid",
      `${ORIGIN}.evil.invalid`,
      "null",
      null,
    ]
  ) {
    const { handler } = setup();
    for (const body of [validBody, {}]) {
      const response = await handler(request(body, origin));
      await response.text();
      assertEquals(
        response.headers.get("access-control-allow-origin"),
        origin === ORIGIN ? ORIGIN : null,
      );
      assertEquals(
        response.headers.get("vary")?.toLowerCase().split(/,\s*/).includes(
          "origin",
        ),
        true,
      );
    }
  }
});

Deno.test("public-api handles OPTIONS without writing and restricts preflight CORS", async () => {
  for (const origin of [ORIGIN, "https://evil.example.invalid"]) {
    const { handler, stored } = setup();
    const response = await handler(
      new Request(ROUTE, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    assertEquals(response.status, 204);
    assertEquals(await response.text(), "");
    assertEquals(
      response.headers.get("access-control-allow-origin"),
      origin === ORIGIN ? ORIGIN : null,
    );
    if (origin === ORIGIN) {
      assertEquals(
        response.headers.get("access-control-allow-methods")?.split(/,\s*/)
          .includes("POST"),
        true,
      );
      assertEquals(
        response.headers.get("access-control-allow-headers")?.toLowerCase()
          .split(/,\s*/).includes("content-type"),
        true,
      );
    }
    assertEquals(stored, []);
  }
});

Deno.test("public-api returns 500 without internal details or personal data in logs", async () => {
  const secret =
    "database password=private-secret Private Test Person private.person@example.invalid";
  const { handler, entries } = setup({
    registrations: {
      create: () => {
        throw new Error(secret);
      },
    },
  });
  const response = await handler(request());
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "INTERNAL_ERROR" });
  assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(entries.length > 0, true);
  assertSafeLogs(entries);
  assertEquals(JSON.stringify(entries).includes("private-secret"), false);
});

const assertSafeLogs = (
  entries: readonly Readonly<Record<string, unknown>>[],
) => {
  for (const entry of entries) {
    assertEquals(entry.requestId, "request-fixture-001");
    assertEquals(
      Object.keys(entry).every((key) =>
        ["requestId", "event", "status", "method", "path"].includes(key)
      ),
      true,
    );
  }
  const serialized = JSON.stringify(entries).toLowerCase();
  for (
    const value of [
      validBody.nombre.toLowerCase(),
      validBody.correo.trim().toLowerCase(),
      "password=",
    ]
  ) {
    assertEquals(serialized.includes(value), false);
  }
};

Deno.test("public-api logs request ids and allow-listed fields without personal data", async () => {
  const { handler, entries } = setup();
  const response = await handler(request());
  await response.text();
  assertEquals(response.status, 201);
  assertEquals(entries.length > 0, true);
  assertSafeLogs(entries);
});

Deno.test("logger drops unexpected fields including bodies errors and secrets", () => {
  const entries: Readonly<Record<string, unknown>>[] = [];
  const logger = createLogger((entry: LogEntry) => entries.push(entry));
  const fields = {
    event: "registration.created",
    status: 201,
    nombre: validBody.nombre,
    email: validBody.correo,
    body: validBody,
    error: new Error("secret"),
    serviceRoleKey: "secret",
  };
  logger.log("request-fixture-001", fields);
  assertEquals(entries, [{
    requestId: "request-fixture-001",
    event: "registration.created",
    status: 201,
  }]);
});

Deno.test("public-api route table rejects unknown paths and unsupported methods", async () => {
  const { handler, stored } = setup();
  const missing = await handler(
    new Request(`${ROUTE}/unknown`, { method: "POST" }),
  );
  await missing.text();
  assertEquals(missing.status, 404);
  const unsupported = await handler(new Request(ROUTE));
  await unsupported.text();
  assertEquals(unsupported.status, 405);
  assertEquals(stored, []);
});

Deno.test("public-api parses before challenge and rejects missing or invalid challenge token with 400", async () => {
  for (const token of [undefined, null, "", "   ", 42]) {
    let challenges = 0;
    let limits = 0;
    const { handler, stored } = setup({
      humanChallenge: {
        verify: () => {
          challenges++;
          return Promise.resolve(true);
        },
      },
      requestLimits: {
        consume: () => {
          limits++;
          return Promise.resolve({ allowed: true });
        },
      },
    });
    const response = await handler(
      request({ ...validBody, challenge_token: token }),
    );
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "INVALID_INPUT" });
    assertEquals(challenges, 0);
    assertEquals(limits, 0);
    assertEquals(stored, []);
  }
});

Deno.test("public-api invalid email is rejected before challenge and limits", async () => {
  const calls: string[] = [];
  const { handler, stored } = setup({
    humanChallenge: {
      verify: () => {
        calls.push("challenge");
        return Promise.resolve(true);
      },
    },
    requestLimits: {
      consume: () => {
        calls.push("limits");
        return Promise.resolve({ allowed: true });
      },
    },
  });
  const response = await handler(
    request({ ...validBody, correo: "not-an-email" }),
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "INVALID_INPUT" });
  assertEquals(calls, []);
  assertEquals(stored, []);
});

for (const blocked of ["challenge", "ip", "email"] as const) {
  Deno.test(`public-api maps blocked ${blocked} to safe error with CORS and no writes`, async () => {
    for (const origin of [ORIGIN, "https://evil.example.invalid", null]) {
      const { handler, stored, entries } = setup({
        humanChallenge: new MemoryHumanChallenge(blocked !== "challenge"),
        requestLimits: {
          consume: (key) =>
            Promise.resolve(
              key.kind === blocked
                ? { allowed: false, retryAfterSeconds: 17 }
                : { allowed: true },
            ),
        },
      });
      const incoming = request(validBody, origin);
      incoming.headers.set("x-forwarded-for", " 203.0.113.7, 198.51.100.1");
      const response = await handler(incoming);
      const status = blocked === "challenge" ? 403 : 429;
      assertEquals(response.status, status);
      assertEquals(await response.json(), {
        error: blocked === "challenge" ? "CHALLENGE_FAILED" : "RATE_LIMITED",
      });
      assertEquals(
        response.headers.get("retry-after"),
        status === 429 ? "17" : null,
      );
      assertEquals(
        response.headers.get("access-control-allow-origin"),
        origin === ORIGIN ? ORIGIN : null,
      );
      assertEquals(
        response.headers.get("vary")?.toLowerCase().includes("origin"),
        true,
      );
      assertEquals(stored, []);
      assertEquals(entries.length > 0, true);
      assertSafeLogs(entries);
      assertEquals(entries.some((entry) => entry.status === status), true);
      for (
        const value of [
          validBody.challenge_token,
          "203.0.113.7",
          "198.51.100.1",
        ]
      ) {
        assertEquals(JSON.stringify(entries).includes(value), false);
      }
    }
  });
}

Deno.test("public-api forwards the first client IP and normalized email to abuse ports", async () => {
  const checks: unknown[] = [];
  const { handler } = setup({
    humanChallenge: {
      verify: (token, ip) => {
        checks.push([token, ip]);
        return Promise.resolve(true);
      },
    },
    requestLimits: {
      consume: (key) => {
        checks.push(key);
        return Promise.resolve({ allowed: true });
      },
    },
  });
  const incoming = request();
  incoming.headers.set("x-forwarded-for", " 203.0.113.7 , 198.51.100.1");
  const response = await handler(incoming);
  await response.text();
  assertEquals(response.status, 201);
  assertEquals(checks, [
    [validBody.challenge_token, "203.0.113.7"],
    { kind: "ip", value: "203.0.113.7" },
    { kind: "email", value: "private.person@example.invalid" },
  ]);
});

Deno.test("public-api missing and invalid forwarded IP share a bucket rather than bypassing limits", async () => {
  const requestLimits = new MemoryRequestLimits(() => NOW);
  for (let attempt = 0; attempt < 21; attempt++) {
    const { handler, stored } = setup({ requestLimits });
    const incoming = request({
      ...validBody,
      correo: `person${attempt}@example.invalid`,
    });
    if (attempt % 2 === 1) {
      incoming.headers.set("x-forwarded-for", "invalid, 203.0.113.7");
    }
    const response = await handler(incoming);
    assertEquals(response.status, attempt < 20 ? 201 : 429);
    if (attempt === 20) {
      assertEquals(await response.json(), { error: "RATE_LIMITED" });
      assertEquals(response.headers.get("retry-after"), "3600");
      assertEquals(stored, []);
    } else {
      await response.text();
    }
  }
});

Deno.test("public-api infrastructure failure never leaks hash IP email token or secret", async () => {
  const hash = "a".repeat(64);
  const secret = "private-hash-secret";
  const { handler, stored, entries } = setup({
    requestLimits: {
      consume: () => {
        throw new Error(
          `${hash} ${secret} 203.0.113.7 ${validBody.correo} ${validBody.challenge_token}`,
        );
      },
    },
  });
  const response = await handler(request());
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "INTERNAL_ERROR" });
  assertEquals(stored, []);
  assertSafeLogs(entries);
  for (
    const value of [hash, secret, "203.0.113.7", validBody.challenge_token]
  ) {
    assertEquals(JSON.stringify(entries).includes(value), false);
  }
});

Deno.test("logger rejects abuse fields including keyed hash and challenge token", () => {
  const entries: LogEntry[] = [];
  createLogger((entry) => entries.push(entry)).log("request-fixture-001", {
    event: "request.failed",
    status: 429,
    challenge_token: validBody.challenge_token,
    token: validBody.challenge_token,
    ip: "203.0.113.7",
    email: validBody.correo,
    hash: "a".repeat(64),
    secret: "private-hash-secret",
  });
  assertEquals(entries, [{
    requestId: "request-fixture-001",
    event: "request.failed",
    status: 429,
  }]);
});
