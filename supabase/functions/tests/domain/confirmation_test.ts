import { assertEquals } from "../dev_deps.ts";
import {
  CONFIRMATION_MAX_ATTEMPTS,
  CONFIRMATION_RETRY_AFTER_MS,
  CONFIRMATION_RETRY_WINDOW_MS,
  confirmationFailed,
  confirmationRetryBounds,
  confirmationSucceeded,
  INITIAL_CONFIRMATION,
  isConfirmationRetryDue,
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

Deno.test("a pending confirmation is retried only once it is stale, under the attempt cap and inside the window", () => {
  const createdAt = new Date("2026-10-25T12:00:00.000Z");
  const after = (ms: number, from = createdAt) => new Date(from.getTime() + ms);

  // Never attempted: the immediate webhook gets the stale timeout to finish.
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      INITIAL_CONFIRMATION,
      after(CONFIRMATION_RETRY_AFTER_MS - 1),
    ),
    false,
  );
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      INITIAL_CONFIRMATION,
      after(CONFIRMATION_RETRY_AFTER_MS),
    ),
    true,
  );

  // The wait restarts from the last attempt, not from the creation.
  const attemptedAt = after(CONFIRMATION_RETRY_AFTER_MS * 3);
  const failed = confirmationFailed(
    INITIAL_CONFIRMATION,
    new DomainError("MAIL_DELIVERY_FAILED"),
    attemptedAt,
  );
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      failed,
      after(CONFIRMATION_RETRY_AFTER_MS - 1, attemptedAt),
    ),
    false,
  );
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      failed,
      after(CONFIRMATION_RETRY_AFTER_MS, attemptedAt),
    ),
    true,
  );

  // A sent confirmation and an exhausted one are never retried.
  const farFuture = after(CONFIRMATION_RETRY_WINDOW_MS - 1);
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      confirmationSucceeded(INITIAL_CONFIRMATION, "id", createdAt),
      farFuture,
    ),
    false,
  );
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      {
        ...failed,
        attempts: CONFIRMATION_MAX_ATTEMPTS,
        lastAttemptAt: createdAt,
      },
      farFuture,
    ),
    false,
  );
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      {
        ...failed,
        attempts: CONFIRMATION_MAX_ATTEMPTS - 1,
        lastAttemptAt: createdAt,
      },
      farFuture,
    ),
    true,
  );

  // Older registrations are history, not pending work.
  assertEquals(
    isConfirmationRetryDue(
      createdAt,
      INITIAL_CONFIRMATION,
      after(CONFIRMATION_RETRY_WINDOW_MS + 1),
    ),
    false,
  );
});

Deno.test("the retry bounds are the exact instants the rule flips", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const { dueBefore, createdAfter } = confirmationRetryBounds(now);
  assertEquals(
    now.getTime() - dueBefore.getTime(),
    CONFIRMATION_RETRY_AFTER_MS,
  );
  assertEquals(
    now.getTime() - createdAfter.getTime(),
    CONFIRMATION_RETRY_WINDOW_MS,
  );
});
