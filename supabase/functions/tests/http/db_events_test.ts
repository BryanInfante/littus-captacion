import { assertEquals } from "../dev_deps.ts";
import { createHandler } from "../../db-events/index.ts";
import { MemoryEvents } from "../../_shared/adapters/memory/events.ts";
import { MemoryMailer } from "../../_shared/adapters/memory/mailer.ts";
import { MemoryRegistrations } from "../../_shared/adapters/memory/registrations.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import { createLogger, type LogEntry } from "../../_shared/log.ts";
import { openEvent } from "../fixtures/registration.ts";
import {
  SCAN_A_CODE,
  scanAContent,
  SITE_URL,
} from "../fixtures/eventContent.ts";

const SECRET = "fixture-webhook-secret";
const ROUTE = "https://edge.example.invalid/db-events/registration-created";
const NOW = new Date("2026-10-25T12:00:00.000Z");

const setup = async () => {
  const events = new MemoryEvents([openEvent({ code: SCAN_A_CODE })], [
    scanAContent,
  ]);
  const registrations = new MemoryRegistrations(events);
  const mailer = new MemoryMailer();
  const entries: LogEntry[] = [];
  const handler = createHandler({
    events,
    registrations,
    mailer,
    siteUrl: SITE_URL,
    now: () => NOW,
    logger: createLogger((entry) => entries.push(entry)),
    requestId: () => "request-fixture-001",
    webhookSecret: () => SECRET,
  });
  const registration = await registrations.create({
    eventCode: SCAN_A_CODE,
    name: "Ana Pérez",
    email: Email.parse("ana@example.invalid"),
    marketingConsent: false,
  });
  return { handler, mailer, registrations, entries, registration };
};

const webhook = (
  record: unknown,
  overrides: Record<string, unknown> = {},
  secret: string | null = SECRET,
  url = ROUTE,
) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== null) headers.set("x-eccia-webhook-secret", secret);
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "INSERT",
      schema: "public",
      table: "eccia_taller_inscripciones",
      record,
      ...overrides,
    }),
  });
};

Deno.test("registration created sends the confirmation and replays idempotently", async () => {
  const { handler, mailer, registration } = await setup();

  const first = await handler(webhook({ id: registration.id }));
  assertEquals(first.status, 200);
  assertEquals((await first.json()).status, "sent");
  assertEquals(mailer.sent.length, 1);

  const replay = await handler(webhook({ id: registration.id }));
  assertEquals(replay.status, 200);
  assertEquals((await replay.json()).status, "already_sent");
  assertEquals(mailer.sent.length, 1);
});

Deno.test("the Supabase-prefixed path reaches the same route", async () => {
  const { handler, registration } = await setup();
  const response = await handler(
    webhook(
      { id: registration.id },
      {},
      SECRET,
      "https://edge.example.invalid/functions/v1/db-events/registration-created",
    ),
  );
  assertEquals(response.status, 200);
});

Deno.test("a missing or wrong webhook secret is rejected before any work", async () => {
  const { handler, mailer, registration } = await setup();
  for (const secret of [null, "wrong-secret"]) {
    const request = webhook({ id: registration.id }, {}, secret);
    const response = await handler(request);
    assertEquals(response.status, 401);
    assertEquals(request.bodyUsed, false);
  }
  assertEquals(mailer.sent.length, 0);
});

Deno.test("malformed webhook payloads are parsed once at the boundary into 400", async () => {
  const { handler, mailer, registration } = await setup();
  const invalid = [
    webhook({ id: "not-a-uuid" }),
    webhook({}),
    webhook(null),
    webhook({ id: registration.id }, { type: "UPDATE" }),
    webhook({ id: registration.id }, { table: "eccia_eventos" }),
    webhook({ id: registration.id }, { schema: "private" }),
    new Request(ROUTE, {
      method: "POST",
      headers: { "x-eccia-webhook-secret": SECRET },
      body: "{not json",
    }),
    new Request(ROUTE, {
      method: "POST",
      headers: { "x-eccia-webhook-secret": SECRET },
      body: "x".repeat(10_000),
    }),
  ];
  for (const request of invalid) {
    const response = await handler(request);
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "INVALID_INPUT" });
  }
  assertEquals(mailer.sent.length, 0);
});

Deno.test("routes and methods are explicit", async () => {
  const { handler, registration } = await setup();
  const unknown = await handler(
    webhook(
      { id: registration.id },
      {},
      SECRET,
      "https://edge.example.invalid/db-events/other",
    ),
  );
  assertEquals(unknown.status, 404);
  const wrongMethod = await handler(
    new Request(ROUTE, {
      method: "GET",
      headers: { "x-eccia-webhook-secret": SECRET },
    }),
  );
  assertEquals(wrongMethod.status, 405);
});

Deno.test("domain errors map through the shared HTTP error table", async () => {
  const { handler, mailer, registration } = await setup();

  const missing = await handler(webhook({ id: crypto.randomUUID() }));
  assertEquals(missing.status, 404);
  assertEquals(await missing.json(), { error: "REGISTRATION_NOT_FOUND" });

  mailer.failNext(new DomainError("MAIL_DELIVERY_FAILED"));
  const failed = await handler(webhook({ id: registration.id }));
  assertEquals(failed.status, 502);
  assertEquals(await failed.json(), { error: "MAIL_DELIVERY_FAILED" });
});

Deno.test("an unexpected failure is a 500 with no internal details or personal data in logs", async () => {
  const { handler, mailer, entries, registration } = await setup();
  mailer.failNext(new Error("provider echoed ana@example.invalid"));

  const response = await handler(webhook({ id: registration.id }));

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "INTERNAL_ERROR" });
  assertEquals(entries.length > 0, true);
  const logged = JSON.stringify(entries);
  assertEquals(logged.includes("example.invalid"), false);
  assertEquals(logged.includes(registration.id), false);
  assertEquals(logged.includes(SECRET), false);
});
