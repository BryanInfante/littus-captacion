import { assertEquals } from "../dev_deps.ts";
import {
  confirmationFailed,
  confirmationSucceeded,
  INITIAL_CONFIRMATION,
  isConfirmationSent,
} from "../../_shared/domain/confirmation.ts";
import { DomainError } from "../../_shared/domain/errors.ts";

const NOW = new Date("2026-10-25T12:00:00.000Z");

Deno.test("a registration is pending until a confirmation was sent", () => {
  assertEquals(isConfirmationSent(INITIAL_CONFIRMATION), false);
  assertEquals(
    isConfirmationSent(confirmationSucceeded(INITIAL_CONFIRMATION, "id", NOW)),
    true,
  );
});

Deno.test("success records the email id, counts the attempt and clears the error", () => {
  const failed = confirmationFailed(
    INITIAL_CONFIRMATION,
    new DomainError("MAIL_DELIVERY_FAILED"),
    NOW,
  );
  const later = new Date(NOW.getTime() + 60_000);
  assertEquals(confirmationSucceeded(failed, "email-1", later), {
    sentAt: later,
    emailId: "email-1",
    attempts: 2,
    lastAttemptAt: later,
    lastError: null,
  });
});

Deno.test("a delivery failure increments attempts and keeps the registration pending", () => {
  const first = confirmationFailed(
    INITIAL_CONFIRMATION,
    new DomainError("MAIL_DELIVERY_FAILED"),
    NOW,
  );
  assertEquals(first, {
    sentAt: null,
    emailId: null,
    attempts: 1,
    lastAttemptAt: NOW,
    lastError: "MAIL_DELIVERY_FAILED",
  });
  assertEquals(
    confirmationFailed(first, new DomainError("MAIL_DELIVERY_FAILED"), NOW)
      .attempts,
    2,
  );
});

Deno.test("an unknown failure records a fixed code, never the error text", () => {
  const state = confirmationFailed(
    INITIAL_CONFIRMATION,
    new Error("smtp rejected person@example.invalid"),
    NOW,
  );
  assertEquals(state.lastError, "UNEXPECTED_ERROR");
  assertEquals(JSON.stringify(state).includes("example.invalid"), false);
});
