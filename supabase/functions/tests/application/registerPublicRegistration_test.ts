import { assertEquals, assertRejects } from "../dev_deps.ts";
import { registerPublicRegistration } from "../../_shared/application/registerPublicRegistration.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import { Email } from "../../_shared/domain/email.ts";
import type { HumanChallenge } from "../../_shared/ports/humanChallenge.ts";
import type { RequestLimits } from "../../_shared/ports/requestLimits.ts";
import { memoryPorts, NOW, openEvent } from "../fixtures/registration.ts";

const input = () => ({
  eventCode: openEvent().code,
  name: "Private Test Person",
  email: Email.parse(" PRIVATE.PERSON@Example.Invalid "),
  challengeToken: "private-challenge-token",
  remoteIp: "203.0.113.7",
});

const setup = (
  challengePasses = true,
  blocked: "ip" | "email" | null = null,
) => {
  const calls: unknown[] = [];
  const base = memoryPorts();
  const humanChallenge: HumanChallenge = {
    verify: (token, remoteIp) => {
      calls.push(["challenge", token, remoteIp]);
      return Promise.resolve(challengePasses);
    },
  };
  const requestLimits: RequestLimits = {
    consume: (key, policy) => {
      calls.push(["limit", key, policy]);
      return Promise.resolve(
        key.kind === blocked
          ? { allowed: false, retryAfterSeconds: 17 }
          : { allowed: true },
      );
    },
  };
  return {
    calls,
    ports: {
      humanChallenge,
      requestLimits,
      events: {
        findByCode: (code: string) => {
          calls.push(["event", code]);
          return base.events.findByCode(code);
        },
      },
      registrations: {
        create: (details: Parameters<typeof base.registrations.create>[0]) => {
          calls.push(["write"]);
          return base.registrations.create(details);
        },
      },
    },
  };
};

Deno.test("public registration checks challenge then IP then normalized email before existing registration use case", async () => {
  const { ports, calls } = setup();
  const created = await registerPublicRegistration(input(), ports, NOW);
  assertEquals(created.email.value, "private.person@example.invalid");
  assertEquals(Object.keys(created).sort(), [
    "email",
    "eventCode",
    "id",
    "marketingConsent",
    "name",
  ]);
  assertEquals(calls, [
    ["challenge", "private-challenge-token", "203.0.113.7"],
    ["limit", { kind: "ip", value: "203.0.113.7" }, {
      limit: 20,
      windowSeconds: 3600,
    }],
    ["limit", { kind: "email", value: "private.person@example.invalid" }, {
      limit: 5,
      windowSeconds: 3600,
    }],
    ["event", openEvent().code],
    ["write"],
  ]);
});

Deno.test("failed challenge consumes no limits and writes no registration", async () => {
  const { ports, calls } = setup(false);
  const error = await assertRejects(
    () => registerPublicRegistration(input(), ports, NOW),
    DomainError,
  );
  if (!(error instanceof DomainError)) throw new Error("Expected DomainError");
  assertEquals(error.code, "CHALLENGE_FAILED");
  assertEquals(calls, [[
    "challenge",
    "private-challenge-token",
    "203.0.113.7",
  ]]);
});

for (const kind of ["ip", "email"] as const) {
  Deno.test(`exhausted ${kind} limit short circuits without event lookup or registration`, async () => {
    const { ports, calls } = setup(true, kind);
    const error = await assertRejects(
      () => registerPublicRegistration(input(), ports, NOW),
      DomainError,
    );
    if (!(error instanceof DomainError)) {
      throw new Error("Expected DomainError");
    }
    assertEquals(error.code, "RATE_LIMITED");
    assertEquals(
      "retryAfterSeconds" in error ? error.retryAfterSeconds : null,
      17,
    );
    assertEquals(calls.length, kind === "ip" ? 2 : 3);
    assertEquals(calls.slice(-1), [["limit", {
      kind,
      value: kind === "ip" ? "203.0.113.7" : "private.person@example.invalid",
    }, { limit: kind === "ip" ? 20 : 5, windowSeconds: 3600 }]]);
  });
}

Deno.test("unknown client IP still consumes the shared IP limit", async () => {
  const { ports, calls } = setup(true, "ip");
  await assertRejects(
    () =>
      registerPublicRegistration(
        { ...input(), remoteIp: "unknown" },
        ports,
        NOW,
      ),
    DomainError,
  );
  assertEquals(calls[1], ["limit", { kind: "ip", value: "unknown" }, {
    limit: 20,
    windowSeconds: 3600,
  }]);
});
