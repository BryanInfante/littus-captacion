import {
  confirmationFailed,
  confirmationSucceeded,
  isConfirmationSent,
} from "../domain/confirmation.ts";
import { DomainError } from "../domain/errors.ts";
import { renderRegistrationConfirmation } from "../email/registrationConfirmation.ts";
import type { Events } from "../ports/events.ts";
import type { Mailer } from "../ports/mailer.ts";
import type { Registrations } from "../ports/registrations.ts";

export type SendRegistrationConfirmationDependencies = {
  readonly registrations: Registrations;
  readonly events: Events;
  readonly mailer: Mailer;
  readonly siteUrl: string;
};

export type ConfirmationOutcome =
  | { readonly status: "sent"; readonly emailId: string }
  | { readonly status: "already_sent"; readonly emailId: string | null };

// Idempotent: the registration row is the source of truth for "already sent",
// and the provider deduplicates retries by the registration-scoped key.
export const sendRegistrationConfirmation = async (
  input: { readonly registrationId: string },
  dependencies: SendRegistrationConfirmationDependencies,
  now: Date,
): Promise<ConfirmationOutcome> => {
  const { registrations, events, mailer, siteUrl } = dependencies;
  const found = await registrations.findForConfirmation(input.registrationId);
  if (found === null) throw new DomainError("REGISTRATION_NOT_FOUND");
  const { registration, confirmation } = found;
  if (isConfirmationSent(confirmation)) {
    return { status: "already_sent", emailId: confirmation.emailId };
  }

  const content = await events.findContentByCode(registration.eventCode);
  if (content === null) throw new DomainError("EVENT_NOT_FOUND");
  const { subject, html } = renderRegistrationConfirmation({
    content,
    recipientName: registration.name,
    siteUrl,
  });

  let sent: { readonly id: string };
  try {
    sent = await mailer.send({
      to: registration.email,
      subject,
      html,
      idempotencyKey: `registration-confirmation/${registration.id}`,
      tags: [
        { name: "email_type", value: "registration_confirmation" },
        { name: "event", value: registration.eventCode },
      ],
    });
  } catch (error) {
    await registrations.saveConfirmation(
      registration.id,
      confirmationFailed(confirmation, error, now),
    );
    throw error;
  }
  await registrations.saveConfirmation(
    registration.id,
    confirmationSucceeded(confirmation, sent.id, now),
  );
  return { status: "sent", emailId: sent.id };
};
