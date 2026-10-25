import { DomainError } from "../../domain/errors.ts";
import type {
  InspectorProfileClaim,
  InspectorProfileReservation,
  InspectorProfiles,
} from "../../ports/inspectorProfiles.ts";
import type { Events } from "../../ports/events.ts";
import { Email } from "../../domain/email.ts";

type Stored = InspectorProfileReservation & {
  readonly registrationId: string;
  state: "pendiente_foto" | "completa";
  updatedAt: Date;
};

export class MemoryInspectorProfiles implements InspectorProfiles {
  private readonly byKey = new Map<string, Stored>();

  constructor(private readonly events: Events) {}

  async claim(
    input: InspectorProfileReservation,
    staleBefore: Date,
    now: Date,
  ): Promise<InspectorProfileClaim> {
    if (await this.events.findByCode(input.eventCode) === null) {
      throw new DomainError("EVENT_NOT_FOUND");
    }
    const key = JSON.stringify([input.eventCode, input.documento]);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      if (existing.state === "completa") return { kind: "complete" };
      if (existing.updatedAt > staleBefore) return { kind: "in_progress" };
      existing.updatedAt = now;
      return this.claimResult(existing);
    }
    if (
      [...this.byKey.values()].some((row) =>
        row.eventCode === input.eventCode && row.email === input.email
      )
    ) {
      throw new DomainError("ALREADY_REGISTERED");
    }
    const stored: Stored = {
      ...input,
      registrationId: crypto.randomUUID(),
      state: "pendiente_foto",
      updatedAt: now,
    };
    this.byKey.set(key, stored);
    return this.claimResult(stored);
  }

  markComplete(id: string, now: Date): Promise<void> {
    const profile = [...this.byKey.values()].find((row) => row.id === id);
    if (profile === undefined || profile.state !== "pendiente_foto") {
      return Promise.reject(new Error("Profile unavailable"));
    }
    profile.state = "completa";
    profile.updatedAt = now;
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    for (const [key, profile] of this.byKey) {
      if (profile.id === id) this.byKey.delete(key);
    }
    return Promise.resolve();
  }

  private claimResult(profile: Stored): InspectorProfileClaim {
    return {
      kind: "claimed",
      id: profile.id,
      photoPath: profile.photoPath,
      registration: {
        id: profile.registrationId,
        name: profile.nombreCompleto,
        email: Email.parse(profile.email),
        eventCode: profile.eventCode,
        marketingConsent: profile.marketingConsent,
      },
    };
  }
}
