import {
  type ConfirmationState,
  INITIAL_CONFIRMATION,
  isConfirmationRetryDue,
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
  private readonly createdAt = new Map<string, Date>();

  // The clock stamps creation, like the database default does.
  constructor(
    private readonly events: Events,
    private readonly clock: () => Date = () => new Date(),
  ) {}

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
    this.createdAt.set(registration.id, this.clock());
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

  findPendingConfirmations(
    query: { readonly now: Date; readonly limit: number },
  ): Promise<readonly string[]> {
    const due: { id: string; createdAt: Date }[] = [];
    for (const [id, state] of this.confirmations) {
      const createdAt = this.createdAt.get(id);
      if (
        createdAt !== undefined &&
        isConfirmationRetryDue(createdAt, state, query.now)
      ) due.push({ id, createdAt });
    }
    due.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return Promise.resolve(due.slice(0, query.limit).map(({ id }) => id));
  }
}
