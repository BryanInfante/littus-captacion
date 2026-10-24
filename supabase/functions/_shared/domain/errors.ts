export type DomainErrorCode =
  | "INVALID_INPUT"
  | "EVENT_NOT_FOUND"
  | "REGISTRATION_CLOSED"
  | "ALREADY_REGISTERED";

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(code);
    this.name = "DomainError";
  }
}
