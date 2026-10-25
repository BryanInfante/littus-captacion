import type { Email } from "../domain/email.ts";

export type EmailTag = { readonly name: string; readonly value: string };

export type OperationalEmail = {
  readonly to: Email;
  readonly subject: string;
  readonly html: string;
  // Lets the provider deduplicate a retry of the same logical message.
  readonly idempotencyKey: string;
  readonly tags: readonly EmailTag[];
};

// Operational email only (confirmations, reminders, certificate delivery).
// Promotional sends go through broadcasts, never through this port.
export interface Mailer {
  // Rejects with DomainError("MAIL_DELIVERY_FAILED") when the provider does not
  // accept the message.
  send(email: OperationalEmail): Promise<{ readonly id: string }>;
}
