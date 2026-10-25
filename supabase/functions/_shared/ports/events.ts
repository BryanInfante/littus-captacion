import type { Event, EventContent } from "../domain/event.ts";

export interface Events {
  findByCode(code: string): Promise<Event | null>;
  findContentByCode(code: string): Promise<EventContent | null>;
}
