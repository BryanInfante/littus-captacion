import { assertEquals, assertRejects } from "../dev_deps.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import { registerForEvent } from "../../_shared/application/registerForEvent.ts";
import {
  memoryPorts,
  NOW,
  openEvent,
  registrationsStub,
} from "../fixtures/registration.ts";

const input = (email = "person@example.invalid") => ({
  eventCode: openEvent().code,
  name: "Test Person",
  email: Email.parse(email),
});

Deno.test("registerForEvent creates a registration and preserves explicit consent", async () => {
  const result = await registerForEvent(
    { ...input(), marketingConsent: true },
    memoryPorts(),
    NOW,
  );
  assertEquals(typeof result.id, "string");
  assertEquals(result.id.length > 0, true);
  assertEquals(result.eventCode, openEvent().code);
  assertEquals(result.name, "Test Person");
  assertEquals(result.email.value, "person@example.invalid");
  assertEquals(result.marketingConsent, true);
});

Deno.test("registerForEvent rejects the same email with different capitalization", async () => {
  const ports = memoryPorts();
  await registerForEvent(input(" PERSON@Example.Invalid "), ports, NOW);
  const error = await assertRejects(
    () => registerForEvent(input("person@example.invalid"), ports, NOW),
    DomainError,
  );
  if (!(error instanceof DomainError)) {
    throw new Error("Expected DomainError", { cause: error });
  }
  assertEquals(error.code, "ALREADY_REGISTERED");
});

Deno.test("registerForEvent rejects an unknown event without creating a registration", async () => {
  const ports = memoryPorts([]);
  let writes = 0;
  const error = await assertRejects(() =>
    registerForEvent(input(), {
      events: ports.events,
      registrations: registrationsStub(() => {
        writes++;
        throw new Error("Unexpected write");
      }),
    }, NOW), DomainError);
  if (!(error instanceof DomainError)) {
    throw new Error("Expected DomainError", { cause: error });
  }
  assertEquals(error.code, "EVENT_NOT_FOUND");
  assertEquals(writes, 0);
});

Deno.test("registerForEvent rejects a closed event without creating a registration", async () => {
  const ports = memoryPorts([openEvent({ registrationClosesAt: NOW })]);
  let writes = 0;
  const error = await assertRejects(() =>
    registerForEvent(input(), {
      events: ports.events,
      registrations: registrationsStub(() => {
        writes++;
        throw new Error("Unexpected write");
      }),
    }, NOW), DomainError);
  if (!(error instanceof DomainError)) {
    throw new Error("Expected DomainError", { cause: error });
  }
  assertEquals(error.code, "REGISTRATION_CLOSED");
  assertEquals(writes, 0);
});

Deno.test("registerForEvent defaults omitted marketing consent to false", async () => {
  const result = await registerForEvent(input(), memoryPorts(), NOW);
  assertEquals(result.marketingConsent, false);
});
