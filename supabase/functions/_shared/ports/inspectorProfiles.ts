import type { InspectorProfile } from "../domain/inspectorProfile.ts";
import type { Registration } from "../domain/registration.ts";

export type InspectorProfileReservation = InspectorProfile & {
  readonly id: string;
  readonly eventCode: string;
  readonly email: string;
  readonly marketingConsent: boolean;
  readonly photoPath: string;
};

export type InspectorProfileClaim =
  | {
    readonly kind: "claimed";
    readonly id: string;
    readonly photoPath: string;
    readonly registration: Registration;
  }
  | { readonly kind: "complete" }
  | { readonly kind: "in_progress" };

export interface InspectorProfiles {
  claim(
    input: InspectorProfileReservation,
    staleBefore: Date,
    now: Date,
  ): Promise<InspectorProfileClaim>;
  markComplete(id: string, now: Date): Promise<void>;
  delete(id: string): Promise<void>;
}
