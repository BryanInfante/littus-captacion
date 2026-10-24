import type { Event } from "../../_shared/domain/event.ts";
import { MemoryEvents } from "../../_shared/adapters/memory/events.ts";
import { MemoryRegistrations } from "../../_shared/adapters/memory/registrations.ts";

export const NOW = new Date("2026-10-20T12:00:00.000Z");

export const openEvent = (overrides: Partial<Event> = {}): Event => ({
  code: "registration-fixture",
  active: true,
  registrationOpensAt: new Date("2026-10-20T11:00:00.000Z"),
  registrationClosesAt: new Date("2026-10-20T13:00:00.000Z"),
  ...overrides,
});

export const memoryPorts = (seed: readonly Event[] = [openEvent()]) => {
  const events = new MemoryEvents(seed);
  const registrations = new MemoryRegistrations(events);
  return { events, registrations };
};
