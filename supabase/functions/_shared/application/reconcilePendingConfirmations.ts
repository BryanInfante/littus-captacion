import { DomainError } from "../domain/errors.ts";
import {
  sendRegistrationConfirmation,
  type SendRegistrationConfirmationDependencies,
} from "./sendRegistrationConfirmation.ts";

export type ReconciliationSummary = {
  readonly attempted: number;
  readonly sent: number;
  readonly failed: number;
  readonly skipped: number;
};

// Rows per cycle: bounds provider calls and run time; the cron runs every five
// minutes, so a backlog drains over several cycles.
export const RECONCILIATION_BATCH_SIZE = 50;

// Retries confirmations the immediate webhook did not deliver. Each row goes
// through sendRegistrationConfirmation, which owns idempotency and the attempt
// bookkeeping; one failing row never stops the batch. Only counts leave this
// use case, because ids and addresses are personal data.
export const reconcilePendingConfirmations = async (
  input: { readonly limit: number },
  dependencies: SendRegistrationConfirmationDependencies,
  now: Date,
): Promise<ReconciliationSummary> => {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new DomainError("INVALID_INPUT");
  }
  const ids = await dependencies.registrations.findPendingConfirmations({
    now,
    limit: input.limit,
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const registrationId of ids) {
    try {
      const outcome = await sendRegistrationConfirmation(
        { registrationId },
        dependencies,
        now,
      );
      if (outcome.status === "sent") sent += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted: ids.length, sent, failed, skipped };
};
