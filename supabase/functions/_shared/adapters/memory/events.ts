import type { Event } from "../../domain/event.ts";
import type { Events } from "../../ports/events.ts";

const copyEvent = (event: Event): Event => ({
  ...event,
  registrationOpensAt: event.registrationOpensAt === null
    ? null
    : new Date(event.registrationOpensAt.getTime()),
  registrationClosesAt: event.registrationClosesAt === null
    ? null
    : new Date(event.registrationClosesAt.getTime()),
});

export class MemoryEvents implements Events {
  private readonly events: Map<string, Event>;

  constructor(seed: readonly Event[]) {
    this.events = new Map(seed.map((event) => [event.code, copyEvent(event)]));
  }

  findByCode(code: string): Promise<Event | null> {
    const event = this.events.get(code);
    return Promise.resolve(event === undefined ? null : copyEvent(event));
  }
}
