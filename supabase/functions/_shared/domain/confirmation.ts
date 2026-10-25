import { DomainError } from "./errors.ts";

// Fixed codes only: the persisted failure never carries provider text, which
// can echo the recipient address.
export type ConfirmationFailureCode =
  | "MAIL_DELIVERY_FAILED"
  | "UNEXPECTED_ERROR";

export type ConfirmationState = {
  readonly sentAt: Date | null;
  readonly emailId: string | null;
  readonly attempts: number;
  readonly lastAttemptAt: Date | null;
  readonly lastError: ConfirmationFailureCode | null;
};

export const INITIAL_CONFIRMATION: ConfirmationState = {
  sentAt: null,
  emailId: null,
  attempts: 0,
  lastAttemptAt: null,
  lastError: null,
};

// A sent confirmation is final: replays of the same webhook do nothing.
export const isConfirmationSent = (state: ConfirmationState): boolean =>
  state.sentAt !== null;

export const confirmationSucceeded = (
  state: ConfirmationState,
  emailId: string,
  now: Date,
): ConfirmationState => ({
  sentAt: now,
  emailId,
  attempts: state.attempts + 1,
  lastAttemptAt: now,
  lastError: null,
});

export const confirmationFailureCode = (
  error: unknown,
): ConfirmationFailureCode =>
  error instanceof DomainError && error.code === "MAIL_DELIVERY_FAILED"
    ? "MAIL_DELIVERY_FAILED"
    : "UNEXPECTED_ERROR";

export const confirmationFailed = (
  state: ConfirmationState,
  error: unknown,
  now: Date,
): ConfirmationState => ({
  ...state,
  attempts: state.attempts + 1,
  lastAttemptAt: now,
  lastError: confirmationFailureCode(error),
});

// Reconciliation policy. A fresh registration gets the stale timeout so the
// immediate webhook can finish before anyone retries; the same wait applies
// after every failed attempt. Attempts are capped so a persistent provider
// failure stops costing calls, and the window keeps the first cycle from
// mailing historical registrations that were never confirmed.
export const CONFIRMATION_RETRY_AFTER_MS = 10 * 60 * 1000;
export const CONFIRMATION_MAX_ATTEMPTS = 5;
export const CONFIRMATION_RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;

// The instants the retry rule flips at `now`: a row is due when its last
// attempt (or creation) is at or before `dueBefore`, and in scope when it was
// created after `createdAfter`. Repositories translate these into queries.
export const confirmationRetryBounds = (
  now: Date,
): { readonly dueBefore: Date; readonly createdAfter: Date } => ({
  dueBefore: new Date(now.getTime() - CONFIRMATION_RETRY_AFTER_MS),
  createdAfter: new Date(now.getTime() - CONFIRMATION_RETRY_WINDOW_MS),
});

export const isConfirmationRetryDue = (
  createdAt: Date,
  state: ConfirmationState,
  now: Date,
): boolean => {
  if (isConfirmationSent(state)) return false;
  if (state.attempts >= CONFIRMATION_MAX_ATTEMPTS) return false;
  const { dueBefore, createdAfter } = confirmationRetryBounds(now);
  if (createdAt.getTime() <= createdAfter.getTime()) return false;
  const lastActivity = state.lastAttemptAt ?? createdAt;
  return lastActivity.getTime() <= dueBefore.getTime();
};
