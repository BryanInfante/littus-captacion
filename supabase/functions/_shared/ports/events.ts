import type { Event } from "../domain/event.ts";

export interface Events {
  findByCode(code: string): Promise<Event | null>;
}
