import { DomainError, type DomainErrorCode } from "../domain/errors.ts";

const STATUS: Readonly<Record<DomainErrorCode, number>> = {
  INVALID_INPUT: 400,
  CHALLENGE_FAILED: 403,
  EVENT_NOT_FOUND: 404,
  ALREADY_REGISTERED: 409,
  REGISTRATION_CLOSED: 409,
  RATE_LIMITED: 429,
  INSPECTOR_PROFILE_REQUIRED: 400,
  INSPECTOR_PROFILE_UNEXPECTED: 400,
  INSPECTOR_PROFILE_IN_PROGRESS: 409,
  PHOTO_UPLOAD_FAILED: 502,
  PAYLOAD_TOO_LARGE: 413,
  REGISTRATION_NOT_FOUND: 404,
  MAIL_DELIVERY_FAILED: 502,
};

export const errorResponse = (error: unknown, headers: Headers): Response => {
  if (error instanceof DomainError) {
    // Copy so the caller's CORS headers stay exactly as they were.
    const responseHeaders = new Headers(headers);
    if (error.retryAfterSeconds !== undefined) {
      responseHeaders.set("retry-after", String(error.retryAfterSeconds));
    }
    return Response.json({ error: error.code }, {
      status: STATUS[error.code],
      headers: responseHeaders,
    });
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500, headers });
};
