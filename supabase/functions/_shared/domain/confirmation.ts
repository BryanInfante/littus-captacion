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
