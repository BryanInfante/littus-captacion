import type { ConfirmationState } from "../domain/confirmation.ts";
import type {
  Registration,
  RegistrationDetails,
} from "../domain/registration.ts";

export type RegistrationConfirmation = {
  readonly registration: Registration;
  readonly confirmation: ConfirmationState;
};

export interface Registrations {
  create(input: RegistrationDetails): Promise<Registration>;
  findForConfirmation(id: string): Promise<RegistrationConfirmation | null>;
  // Never overwrites a confirmation that was already sent.
  saveConfirmation(id: string, state: ConfirmationState): Promise<void>;
  // Ids of up to `limit` registrations whose confirmation is due for a retry
  // at `now` (see isConfirmationRetryDue), oldest first.
  findPendingConfirmations(
    query: { readonly now: Date; readonly limit: number },
  ): Promise<readonly string[]>;
}
