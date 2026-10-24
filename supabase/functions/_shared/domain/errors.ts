export type DomainErrorCode =
  | "INVALID_INPUT"
  | "EVENT_NOT_FOUND"
  | "REGISTRATION_CLOSED"
  | "ALREADY_REGISTERED"
  | "CHALLENGE_FAILED"
  | "RATE_LIMITED"
  | "INSPECTOR_PROFILE_REQUIRED"
  | "INSPECTOR_PROFILE_UNEXPECTED"
  | "INSPECTOR_PROFILE_IN_PROGRESS"
  | "PHOTO_UPLOAD_FAILED"
  | "PAYLOAD_TOO_LARGE";

export class DomainError extends Error {
  // Whole seconds until the exhausted limit resets; only RATE_LIMITED has one.
  readonly retryAfterSeconds: number | undefined;

  constructor(code: "RATE_LIMITED", retryAfterSeconds: number);
  constructor(code: Exclude<DomainErrorCode, "RATE_LIMITED">);
  constructor(readonly code: DomainErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = "DomainError";
    if (
      retryAfterSeconds !== undefined && !Number.isFinite(retryAfterSeconds)
    ) {
      throw new RangeError("Retry delay must be a finite number of seconds");
    }
    // Retry-After needs a positive integer: round up so a client never retries
    // before the window has actually reset.
    this.retryAfterSeconds = retryAfterSeconds === undefined
      ? undefined
      : Math.max(1, Math.ceil(retryAfterSeconds));
  }
}
