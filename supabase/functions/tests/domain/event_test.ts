import { assertEquals } from "../dev_deps.ts";
import { acceptsRegistrations } from "../../_shared/domain/event.ts";
import { NOW, openEvent } from "../fixtures/registration.ts";

const cases = [
  {
    name: "inactive event",
    event: openEvent({ active: false }),
    accepts: false,
  },
  {
    name: "no opening",
    event: openEvent({ registrationOpensAt: null }),
    accepts: false,
  },
  {
    name: "before opening",
    event: openEvent({ registrationOpensAt: new Date(NOW.getTime() + 1) }),
    accepts: false,
  },
  {
    name: "at opening",
    event: openEvent({ registrationOpensAt: NOW }),
    accepts: true,
  },
  { name: "open window", event: openEvent(), accepts: true },
  {
    name: "at closing",
    event: openEvent({ registrationClosesAt: NOW }),
    accepts: false,
  },
  {
    name: "after closing",
    event: openEvent({ registrationClosesAt: new Date(NOW.getTime() - 1) }),
    accepts: false,
  },
  {
    name: "no closing",
    event: openEvent({ registrationClosesAt: null }),
    accepts: true,
  },
  {
    name: "both boundaries null",
    event: openEvent({ registrationOpensAt: null, registrationClosesAt: null }),
    accepts: false,
  },
];

for (const { name, event, accepts } of cases) {
  Deno.test(`event registration window: ${name}`, () => {
    assertEquals(acceptsRegistrations(event, NOW), accepts);
  });
}
