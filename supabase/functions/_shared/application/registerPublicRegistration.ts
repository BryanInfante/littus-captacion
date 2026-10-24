import { DomainError } from "../domain/errors.ts";
import type { Registration } from "../domain/registration.ts";
import {
  EMAIL_REGISTRATION_LIMIT,
  IP_REGISTRATION_LIMIT,
  type RequestLimitPolicy,
} from "../domain/requestLimits.ts";
import type { Events } from "../ports/events.ts";
import type { HumanChallenge } from "../ports/humanChallenge.ts";
import type { Registrations } from "../ports/registrations.ts";
import type { RequestLimitKey, RequestLimits } from "../ports/requestLimits.ts";
import {
  registerForEvent,
  type RegisterForEventInput,
} from "./registerForEvent.ts";

export type RegisterPublicRegistrationInput = RegisterForEventInput & {
  readonly challengeToken: string;
  readonly remoteIp: string;
};

export type PublicRegistrationPorts = {
  readonly events: Events;
  readonly registrations: Registrations;
  readonly humanChallenge: HumanChallenge;
  readonly requestLimits: RequestLimits;
};

const consume = async (
  limits: RequestLimits,
  key: RequestLimitKey,
  policy: RequestLimitPolicy,
): Promise<void> => {
  const decision = await limits.consume(key, policy);
  if (!decision.allowed) {
    throw new DomainError("RATE_LIMITED", decision.retryAfterSeconds);
  }
};

// Abuse protection in front of the registration use case. A failed challenge
// consumes no limit; attempts that pass it count even if the event turns out
// closed or the registration duplicated.
export const registerPublicRegistration = async (
  input: RegisterPublicRegistrationInput,
  ports: PublicRegistrationPorts,
  now: Date,
): Promise<Registration> => {
  // The token and the IP stop here: they never reach the registration store.
  const { challengeToken, remoteIp, ...registration } = input;
  if (!await ports.humanChallenge.verify(challengeToken, remoteIp)) {
    throw new DomainError("CHALLENGE_FAILED");
  }
  await consume(
    ports.requestLimits,
    { kind: "ip", value: remoteIp },
    IP_REGISTRATION_LIMIT,
  );
  await consume(
    ports.requestLimits,
    { kind: "email", value: registration.email.value },
    EMAIL_REGISTRATION_LIMIT,
  );
  return await registerForEvent(registration, ports, now);
};
