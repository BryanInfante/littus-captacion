import { DomainError } from "../../domain/errors.ts";
import type {
  Registration,
  RegistrationDetails,
} from "../../domain/registration.ts";
import type { Events } from "../../ports/events.ts";
import type { Registrations } from "../../ports/registrations.ts";

export class MemoryRegistrations implements Registrations {
  private readonly records = new Map<string, Registration>();

  constructor(private readonly events: Events) {}

  async create(input: RegistrationDetails): Promise<Registration> {
    if (await this.events.findByCode(input.eventCode) === null) {
      throw new DomainError("EVENT_NOT_FOUND");
    }
    const key = JSON.stringify([input.eventCode, input.email.value]);
    // No await between uniqueness check and insert: concurrent calls cannot
    // both pass, matching the database's unique-index behavior.
    if (this.records.has(key)) throw new DomainError("ALREADY_REGISTERED");
    const registration: Registration = { ...input, id: crypto.randomUUID() };
    this.records.set(key, registration);
    return { ...registration };
  }
}
