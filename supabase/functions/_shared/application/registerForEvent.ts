import { DomainError } from "../domain/errors.ts";
import { acceptsRegistrations } from "../domain/event.ts";
import type {
  Registration,
  RegistrationDetails,
} from "../domain/registration.ts";
import type { Events } from "../ports/events.ts";
import type { Registrations } from "../ports/registrations.ts";
import {
  parseInspectorProfile,
  validateInspectorPhoto,
} from "../domain/inspectorProfile.ts";
import type { InspectorProfiles } from "../ports/inspectorProfiles.ts";
import type { FileStorage } from "../ports/fileStorage.ts";
import type { Logger } from "../log.ts";
import { registerInspectorProfile } from "./registerInspectorProfile.ts";

export type RegisterForEventInput =
  & Omit<RegistrationDetails, "marketingConsent">
  & {
    readonly marketingConsent?: boolean;
    readonly inspector?: {
      readonly fields: Readonly<Record<string, unknown>>;
      readonly photoBytes: Uint8Array | null;
      readonly photoTooLarge: boolean;
    };
  };

export const registerForEvent = async (
  input: RegisterForEventInput,
  ports: {
    readonly events: Events;
    readonly registrations: Registrations;
    readonly inspectorProfiles?: InspectorProfiles;
    readonly fileStorage?: FileStorage;
    readonly logger?: Logger;
  },
  now: Date,
): Promise<Registration> => {
  const event = await ports.events.findByCode(input.eventCode);
  if (event === null) throw new DomainError("EVENT_NOT_FOUND");
  if (!acceptsRegistrations(event, now)) {
    throw new DomainError("REGISTRATION_CLOSED");
  }
  if (event.requiresInspectorProfile === true) {
    if (
      input.inspector === undefined || ports.inspectorProfiles === undefined ||
      ports.fileStorage === undefined || ports.logger === undefined
    ) {
      throw new DomainError("INSPECTOR_PROFILE_REQUIRED");
    }
    const profile = parseInspectorProfile(input.inspector.fields, now);
    if (input.inspector.photoTooLarge) {
      throw new DomainError("PAYLOAD_TOO_LARGE");
    }
    if (input.inspector.photoBytes === null) {
      throw new DomainError("INVALID_INPUT");
    }
    const photo = validateInspectorPhoto(input.inspector.photoBytes);
    return await registerInspectorProfile({
      eventCode: input.eventCode,
      email: input.email.value,
      marketingConsent: input.marketingConsent ?? false,
      profile,
      photo,
    }, {
      profiles: ports.inspectorProfiles,
      storage: ports.fileStorage,
      logger: ports.logger,
    }, now);
  }
  if (input.inspector !== undefined) {
    throw new DomainError("INSPECTOR_PROFILE_UNEXPECTED");
  }
  return await ports.registrations.create({
    ...input,
    marketingConsent: input.marketingConsent ?? false,
  });
};
