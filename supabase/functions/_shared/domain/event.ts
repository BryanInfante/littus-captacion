export type Event = {
  readonly code: string;
  readonly active: boolean;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
};

export const acceptsRegistrations = (event: Event, now: Date): boolean =>
  event.active && event.registrationOpensAt !== null &&
  event.registrationOpensAt.getTime() <= now.getTime() &&
  (event.registrationClosesAt === null ||
    now.getTime() < event.registrationClosesAt.getTime());
