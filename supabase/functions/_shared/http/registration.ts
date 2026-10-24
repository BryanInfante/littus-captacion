import type { RegisterForEventInput } from "../application/registerForEvent.ts";
import { Email } from "../domain/email.ts";
import { DomainError } from "../domain/errors.ts";
import {
  parseEventCode,
  parseRegistrationName,
} from "../domain/registration.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseRegistrationRequest = async (
  request: Request,
): Promise<RegisterForEventInput> => {
  const mediaType = request.headers.get("content-type")?.split(";")[0]
    .trim().toLowerCase();
  if (mediaType !== "application/json") throw new DomainError("INVALID_INPUT");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new DomainError("INVALID_INPUT");
  }
  if (!isRecord(body) || typeof body.correo !== "string") {
    throw new DomainError("INVALID_INPUT");
  }
  if (
    body.marketing_consent !== undefined &&
    typeof body.marketing_consent !== "boolean"
  ) {
    throw new DomainError("INVALID_INPUT");
  }
  return {
    eventCode: parseEventCode(body.event_code),
    name: parseRegistrationName(body.nombre),
    email: Email.parse(body.correo),
    marketingConsent: body.marketing_consent ?? false,
  };
};
