import type { Email } from "./email.ts";
import { DomainError } from "./errors.ts";

export type RegistrationDetails = {
  readonly eventCode: string;
  readonly name: string;
  readonly email: Email;
  readonly marketingConsent: boolean;
};

export type Registration = RegistrationDetails & { readonly id: string };

const boundedText = (
  input: unknown,
  minimum: number,
  maximum: number,
): string => {
  if (typeof input !== "string") throw new DomainError("INVALID_INPUT");
  const value = input.trim();
  // PostgreSQL char_length counts code points, not UTF-16 code units.
  const length = [...value].length;
  if (length < minimum || length > maximum) {
    throw new DomainError("INVALID_INPUT");
  }
  return value;
};

export const parseRegistrationName = (input: unknown): string =>
  boundedText(input, 2, 120);

export const parseEventCode = (input: unknown): string =>
  boundedText(input, 3, 80);
