import {
  type ConfirmationState,
  INITIAL_CONFIRMATION,
  isConfirmationSent,
} from "../../domain/confirmation.ts";
import { DomainError } from "../../domain/errors.ts";
import type {
  Registration,
  RegistrationDetails,
} from "../../domain/registration.ts";
import type { Events } from "../../ports/events.ts";
import type {
  RegistrationConfirmation,
  Registrations,
} from "../../ports/registrations.ts";

export class MemoryRegistrations implements Registrations {
  private readonly records = new Map<string, Registration>();
  private readonly confirmations = new Map<string, ConfirmationState>();

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
    this.confirmations.set(registration.id, INITIAL_CONFIRMATION);
    return { ...registration };
  }

  findForConfirmation(id: string): Promise<RegistrationConfirmation | null> {
    const registration = [...this.records.values()].find((record) =>
      record.id === id
    );
    const confirmation = this.confirmations.get(id);
    return Promise.resolve(
      registration === undefined || confirmation === undefined
        ? null
        : { registration: { ...registration }, confirmation },
    );
  }

  saveConfirmation(id: string, state: ConfirmationState): Promise<void> {
    const current = this.confirmations.get(id);
    if (current !== undefined && !isConfirmationSent(current)) {
      this.confirmations.set(id, state);
    }
    return Promise.resolve();
  }
}
