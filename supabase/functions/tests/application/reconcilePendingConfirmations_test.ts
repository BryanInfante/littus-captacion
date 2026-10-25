import { assertEquals } from "../dev_deps.ts";
import { MemoryEvents } from "../../_shared/adapters/memory/events.ts";
import { MemoryMailer } from "../../_shared/adapters/memory/mailer.ts";
import { MemoryRegistrations } from "../../_shared/adapters/memory/registrations.ts";
import { reconcilePendingConfirmations } from "../../_shared/application/reconcilePendingConfirmations.ts";
import {
  CONFIRMATION_MAX_ATTEMPTS,
  CONFIRMATION_RETRY_AFTER_MS,
} from "../../_shared/domain/confirmation.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import type { Registrations } from "../../_shared/ports/registrations.ts";
import { NOW, openEvent } from "../fixtures/registration.ts";
import {
  SCAN_A_CODE,
  scanAContent,
  SITE_URL,
} from "../fixtures/eventContent.ts";

const setup = () => {
  let clock = NOW;
  const events = new MemoryEvents([openEvent({ code: SCAN_A_CODE })], [
    scanAContent,
  ]);
  const registrations = new MemoryRegistrations(events, () => clock);
  const mailer = new MemoryMailer();
  const register = (email: string) =>
    registrations.create({
      eventCode: SCAN_A_CODE,
      name: "Ana Pérez",
      email: Email.parse(email),
      marketingConsent: false,
    });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
    return clock;
  };
  const run = (limit = 50, port: Registrations = registrations) =>
    reconcilePendingConfirmations(
      { limit },
      { registrations: port, events, mailer, siteUrl: SITE_URL },
      clock,
    );
  return { registrations, mailer, register, advance, run };
};

const NOTHING = { attempted: 0, sent: 0, failed: 0, skipped: 0 };

Deno.test("does nothing while registrations are younger than the stale timeout", async () => {
  const { mailer, register, advance, run } = setup();
  await register("a@example.invalid");
  advance(CONFIRMATION_RETRY_AFTER_MS - 1);

  assertEquals(await run(), NOTHING);
  assertEquals(mailer.sent.length, 0);
});

Deno.test("sends the confirmation of a stale pending registration exactly once", async () => {
  const { mailer, register, advance, run } = setup();
  const { id } = await register("a@example.invalid");
  advance(CONFIRMATION_RETRY_AFTER_MS);

  assertEquals(await run(), { attempted: 1, sent: 1, failed: 0, skipped: 0 });
  assertEquals(mailer.sent.length, 1);
  assertEquals(
    mailer.sent[0].idempotencyKey,
    `registration-confirmation/${id}`,
  );

  advance(CONFIRMATION_RETRY_AFTER_MS * 2);
  assertEquals(await run(), NOTHING);
  assertEquals(mailer.sent.length, 1);
});

Deno.test("a failing row is counted and does not stop the others", async () => {
  const { mailer, register, advance, run } = setup();
  await register("a@example.invalid");
  await register("b@example.invalid");
  advance(CONFIRMATION_RETRY_AFTER_MS);
  mailer.failNext(new DomainError("MAIL_DELIVERY_FAILED"));

  assertEquals(await run(), { attempted: 2, sent: 1, failed: 1, skipped: 0 });
  assertEquals(mailer.sent.length, 1);

  // The failed row waits a full timeout from its last attempt, then succeeds.
  assertEquals(await run(), NOTHING);
  advance(CONFIRMATION_RETRY_AFTER_MS);
  assertEquals(await run(), { attempted: 1, sent: 1, failed: 0, skipped: 0 });
  assertEquals(mailer.sent.length, 2);
});

Deno.test("stops retrying a row after the maximum number of attempts", async () => {
  const { register, mailer, advance, run } = setup();
  await register("a@example.invalid");
  for (let attempt = 0; attempt < CONFIRMATION_MAX_ATTEMPTS; attempt++) {
    advance(CONFIRMATION_RETRY_AFTER_MS);
    mailer.failNext(new Error("provider down"));
    assertEquals(await run(), { attempted: 1, sent: 0, failed: 1, skipped: 0 });
  }
  advance(CONFIRMATION_RETRY_AFTER_MS);
  assertEquals(await run(), NOTHING);
});

Deno.test("the batch is bounded by the limit, oldest first", async () => {
  const { mailer, register, advance, run } = setup();
  for (const name of ["a", "b", "c"]) {
    await register(`${name}@example.invalid`);
    advance(1000);
  }
  advance(CONFIRMATION_RETRY_AFTER_MS);

  assertEquals(await run(2), { attempted: 2, sent: 2, failed: 0, skipped: 0 });
  assertEquals(mailer.sent.map((message) => message.to.value), [
    "a@example.invalid",
    "b@example.invalid",
  ]);
  assertEquals(await run(2), { attempted: 1, sent: 1, failed: 0, skipped: 0 });
});

Deno.test("a row sent by the webhook after the query is skipped, not sent twice", async () => {
  const { registrations, mailer, register, advance, run } = setup();
  const { id } = await register("a@example.invalid");
  advance(CONFIRMATION_RETRY_AFTER_MS);
  const raced: Registrations = {
    create: (input) => registrations.create(input),
    findForConfirmation: (rowId) => registrations.findForConfirmation(rowId),
    saveConfirmation: (rowId, state) =>
      registrations.saveConfirmation(rowId, state),
    findPendingConfirmations: async (query) => {
      const ids = await registrations.findPendingConfirmations(query);
      await registrations.saveConfirmation(id, {
        sentAt: query.now,
        emailId: "webhook-email",
        attempts: 1,
        lastAttemptAt: query.now,
        lastError: null,
      });
      return ids;
    },
  };

  assertEquals(await run(50, raced), {
    attempted: 1,
    sent: 0,
    failed: 0,
    skipped: 1,
  });
  assertEquals(mailer.sent.length, 0);
});

Deno.test("a registration still waiting for its profile is skipped without spending an attempt", async () => {
  let clock = NOW;
  const events = new MemoryEvents(
    [openEvent({ code: SCAN_A_CODE, requiresInspectorProfile: true })],
    [scanAContent],
  );
  const completeProfiles = new Set<string>();
  const registrations = new MemoryRegistrations(
    events,
    () => clock,
    (registrationId) => completeProfiles.has(registrationId),
  );
  const mailer = new MemoryMailer();
  const { id } = await registrations.create({
    eventCode: SCAN_A_CODE,
    name: "Ana Pérez",
    email: Email.parse("a@example.invalid"),
    marketingConsent: false,
  });
  const run = () =>
    reconcilePendingConfirmations(
      { limit: 50 },
      { registrations, events, mailer, siteUrl: SITE_URL },
      clock,
    );

  clock = new Date(clock.getTime() + CONFIRMATION_RETRY_AFTER_MS);
  for (let cycle = 0; cycle < CONFIRMATION_MAX_ATTEMPTS + 1; cycle++) {
    assertEquals(await run(), { attempted: 1, sent: 0, failed: 0, skipped: 1 });
  }
  assertEquals(mailer.sent.length, 0);
  assertEquals((await registrations.findForConfirmation(id))?.confirmation, {
    sentAt: null,
    emailId: null,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  });

  completeProfiles.add(id);
  assertEquals(await run(), { attempted: 1, sent: 1, failed: 0, skipped: 0 });
});
