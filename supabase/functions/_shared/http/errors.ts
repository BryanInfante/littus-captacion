import { DomainError, type DomainErrorCode } from "../domain/errors.ts";

const STATUS: Readonly<Record<DomainErrorCode, number>> = {
  INVALID_INPUT: 400,
  EVENT_NOT_FOUND: 404,
  ALREADY_REGISTERED: 409,
  REGISTRATION_CLOSED: 409,
};

export const errorResponse = (error: unknown, headers: Headers): Response => {
  if (error instanceof DomainError) {
    return Response.json({ error: error.code }, {
      status: STATUS[error.code],
      headers,
    });
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500, headers });
};
