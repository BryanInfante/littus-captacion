import type { RegisterPublicRegistrationInput } from "../application/registerPublicRegistration.ts";
import { Email } from "../domain/email.ts";
import { DomainError } from "../domain/errors.ts";
import {
  parseEventCode,
  parseRegistrationName,
} from "../domain/registration.ts";
import { extractClientIp } from "../domain/requestLimits.ts";

// Turnstile documents tokens of up to 2048 characters.
const MAX_CHALLENGE_TOKEN_LENGTH = 2048;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseChallengeToken = (input: unknown): string => {
  if (typeof input !== "string") throw new DomainError("INVALID_INPUT");
  const token = input.trim();
  if (token.length === 0 || token.length > MAX_CHALLENGE_TOKEN_LENGTH) {
    throw new DomainError("INVALID_INPUT");
  }
  return token;
};

// Parses the whole request before any side effect: an invalid field never
// reaches the challenge verifier or consumes a limit.
export const parseRegistrationRequest = async (
  request: Request,
): Promise<RegisterPublicRegistrationInput> => {
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
    challengeToken: parseChallengeToken(body.challenge_token),
    remoteIp: extractClientIp(request.headers.get("x-forwarded-for")),
  };
};
