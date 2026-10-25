import type { Event, EventContent } from "../../domain/event.ts";
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
  private readonly contents: Map<string, EventContent>;

  constructor(seed: readonly Event[], contents: readonly EventContent[] = []) {
    this.events = new Map(seed.map((event) => [event.code, copyEvent(event)]));
    this.contents = new Map(
      contents.map((content) => [content.code, { ...content }]),
    );
  }

  findByCode(code: string): Promise<Event | null> {
    const event = this.events.get(code);
    return Promise.resolve(event === undefined ? null : copyEvent(event));
  }

  findContentByCode(code: string): Promise<EventContent | null> {
    const content = this.contents.get(code);
    return Promise.resolve(content === undefined ? null : { ...content });
  }
}
