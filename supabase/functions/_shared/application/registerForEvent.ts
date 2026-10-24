import { DomainError } from "../domain/errors.ts";
import { acceptsRegistrations } from "../domain/event.ts";
import type {
  Registration,
  RegistrationDetails,
} from "../domain/registration.ts";
import type { Events } from "../ports/events.ts";
import type { Registrations } from "../ports/registrations.ts";

export type RegisterForEventInput =
  & Omit<RegistrationDetails, "marketingConsent">
  & { readonly marketingConsent?: boolean };

export const registerForEvent = async (
  input: RegisterForEventInput,
  ports: { readonly events: Events; readonly registrations: Registrations },
  now: Date,
): Promise<Registration> => {
  const event = await ports.events.findByCode(input.eventCode);
  if (event === null) throw new DomainError("EVENT_NOT_FOUND");
  if (!acceptsRegistrations(event, now)) {
    throw new DomainError("REGISTRATION_CLOSED");
  }
  return await ports.registrations.create({
    ...input,
    marketingConsent: input.marketingConsent ?? false,
  });
};
