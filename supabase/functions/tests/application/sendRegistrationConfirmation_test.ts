import { assertEquals, assertRejects } from "../dev_deps.ts";
import { MemoryEvents } from "../../_shared/adapters/memory/events.ts";
import { MemoryMailer } from "../../_shared/adapters/memory/mailer.ts";
import { MemoryRegistrations } from "../../_shared/adapters/memory/registrations.ts";
import { sendRegistrationConfirmation } from "../../_shared/application/sendRegistrationConfirmation.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import { NOW, openEvent } from "../fixtures/registration.ts";
import {
  SCAN_A_CODE,
  scanAContent,
  SITE_URL,
  UT2_CODE,
  ut2Content,
} from "../fixtures/eventContent.ts";

const setup = () => {
  const events = new MemoryEvents(
    [openEvent({ code: SCAN_A_CODE }), openEvent({ code: UT2_CODE })],
    [scanAContent, ut2Content],
  );
  const registrations = new MemoryRegistrations(events);
  const mailer = new MemoryMailer();
  const register = (eventCode: string, email = "ana@example.invalid") =>
    registrations.create({
      eventCode,
      name: "Ana Pérez",
      email: Email.parse(email),
      marketingConsent: false,
    });
  const run = (registrationId: string, now = NOW) =>
    sendRegistrationConfirmation(
      { registrationId },
      { registrations, events, mailer, siteUrl: SITE_URL },
      now,
    );
  return { events, registrations, mailer, register, run };
};

const stateOf = async (
  registrations: MemoryRegistrations,
  id: string,
) => (await registrations.findForConfirmation(id))?.confirmation;

Deno.test("sends the event's confirmation once and persists the sent state", async () => {
  const { registrations, mailer, register, run } = setup();
  const { id } = await register(SCAN_A_CODE);

  const result = await run(id);

  assertEquals(result.status, "sent");
  assertEquals(mailer.sent.length, 1);
  const [message] = mailer.sent;
  assertEquals(message.to.value, "ana@example.invalid");
  assertEquals(
    message.subject,
    "Inscripción confirmada | Domina la lectura del Scan A",
  );
  assertEquals(message.idempotencyKey, `registration-confirmation/${id}`);
  assertEquals(message.tags, [
    { name: "email_type", value: "registration_confirmation" },
    { name: "event", value: SCAN_A_CODE },
  ]);
  assertEquals(message.html.includes(scanAContent.communityUrl ?? ""), true);
  assertEquals(await stateOf(registrations, id), {
    sentAt: NOW,
    emailId: result.emailId,
    attempts: 1,
    lastAttemptAt: NOW,
    lastError: null,
  });
});

Deno.test("a replay of a sent confirmation short-circuits without mailing", async () => {
  const { mailer, register, run } = setup();
  const { id } = await register(SCAN_A_CODE);
  const first = await run(id);

  const replay = await run(id, new Date(NOW.getTime() + 60_000));

  assertEquals(replay, { status: "already_sent", emailId: first.emailId });
  assertEquals(mailer.sent.length, 1);
});

Deno.test("each event renders its own content from the event row", async () => {
  const { mailer, register, run } = setup();
  await run((await register(UT2_CODE)).id);

  const [message] = mailer.sent;
  assertEquals(
    message.subject,
    "Inscripción confirmada | Ultrasonido Convencional Nivel II",
  );
  assertEquals(message.html.includes("Domina la lectura"), false);
  assertEquals(message.tags[1], { name: "event", value: UT2_CODE });
});

Deno.test("an unknown registration is a typed error and sends nothing", async () => {
  const { mailer, run } = setup();
  const error = await assertRejects(
    () => run(crypto.randomUUID()),
    DomainError,
  );
  assertEquals((error as DomainError).code, "REGISTRATION_NOT_FOUND");
  assertEquals(mailer.sent.length, 0);
});

Deno.test("an event without content fails before mailing", async () => {
  const events = new MemoryEvents([openEvent({ code: "no-content" })]);
  const registrations = new MemoryRegistrations(events);
  const mailer = new MemoryMailer();
  const { id } = await registrations.create({
    eventCode: "no-content",
    name: "Ana Pérez",
    email: Email.parse("ana@example.invalid"),
    marketingConsent: false,
  });
  const error = await assertRejects(
    () =>
      sendRegistrationConfirmation(
        { registrationId: id },
        { registrations, events, mailer, siteUrl: SITE_URL },
        NOW,
      ),
    DomainError,
  );
  assertEquals((error as DomainError).code, "EVENT_NOT_FOUND");
  assertEquals(mailer.sent.length, 0);
});

Deno.test("a delivery failure is recorded, stays pending and can be retried", async () => {
  const { registrations, mailer, register, run } = setup();
  const { id } = await register(SCAN_A_CODE);
  mailer.failNext(new DomainError("MAIL_DELIVERY_FAILED"));

  const error = await assertRejects(() => run(id), DomainError);
  assertEquals((error as DomainError).code, "MAIL_DELIVERY_FAILED");
  assertEquals(await stateOf(registrations, id), {
    sentAt: null,
    emailId: null,
    attempts: 1,
    lastAttemptAt: NOW,
    lastError: "MAIL_DELIVERY_FAILED",
  });

  const retryAt = new Date(NOW.getTime() + 120_000);
  assertEquals((await run(id, retryAt)).status, "sent");
  const state = await stateOf(registrations, id);
  assertEquals(state?.attempts, 2);
  assertEquals(state?.lastError, null);
  assertEquals(state?.sentAt, retryAt);
});

Deno.test("an unexpected mailer error is recorded as a fixed code and rethrown", async () => {
  const { registrations, mailer, register, run } = setup();
  const { id } = await register(SCAN_A_CODE);
  const cause = new Error("provider echoed ana@example.invalid");
  mailer.failNext(cause);

  const error = await assertRejects(() => run(id), Error);
  assertEquals(error, cause);
  const state = await stateOf(registrations, id);
  assertEquals(state?.lastError, "UNEXPECTED_ERROR");
  assertEquals(JSON.stringify(state).includes("example.invalid"), false);
});
