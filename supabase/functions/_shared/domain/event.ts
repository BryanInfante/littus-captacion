export type Event = {
  readonly code: string;
  readonly active: boolean;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
  readonly requiresInspectorProfile?: boolean;
};

export const acceptsRegistrations = (event: Event, now: Date): boolean =>
  event.active && event.registrationOpensAt !== null &&
  event.registrationOpensAt.getTime() <= now.getTime() &&
  (event.registrationClosesAt === null ||
    now.getTime() < event.registrationClosesAt.getTime());

// Per-event copy and links for operational email. Everything an event may
// differ on lives in its row, so a new event never needs new code.
export type EventContent = {
  readonly code: string;
  readonly title: string;
  readonly kind: string | null;
  readonly dateText: string | null;
  readonly durationText: string | null;
  readonly scheduleText: string | null;
  readonly modalityText: string | null;
  readonly includesText: string | null;
  readonly communityUrl: string | null;
  readonly streamUrl: string | null;
  readonly classroomUrl: string | null;
};
