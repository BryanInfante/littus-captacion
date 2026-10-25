import type { Event, EventContent } from "../../_shared/domain/event.ts";
import { MemoryEvents } from "../../_shared/adapters/memory/events.ts";
import { MemoryRegistrations } from "../../_shared/adapters/memory/registrations.ts";
import type { Events } from "../../_shared/ports/events.ts";
import type { Registrations } from "../../_shared/ports/registrations.ts";

export const NOW = new Date("2026-10-20T12:00:00.000Z");

export const openEvent = (overrides: Partial<Event> = {}): Event => ({
  code: "registration-fixture",
  active: true,
  registrationOpensAt: new Date("2026-10-20T11:00:00.000Z"),
  registrationClosesAt: new Date("2026-10-20T13:00:00.000Z"),
  ...overrides,
});

export const memoryPorts = (
  seed: readonly Event[] = [openEvent()],
  contents: readonly EventContent[] = [],
) => {
  const events = new MemoryEvents(seed, contents);
  const registrations = new MemoryRegistrations(events);
  return { events, registrations };
};

const unused = (): never => {
  throw new Error("Port method not expected in this test");
};

// Stubs for code that only creates registrations or only looks events up: the
// methods that belong to other use cases fail loudly if they are ever called.
export const registrationsStub = (
  create: Registrations["create"],
): Registrations => ({
  create,
  findForConfirmation: unused,
  saveConfirmation: unused,
});

export const eventsStub = (findByCode: Events["findByCode"]): Events => ({
  findByCode,
  findContentByCode: unused,
});
