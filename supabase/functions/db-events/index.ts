import { sendRegistrationConfirmation } from "../_shared/application/sendRegistrationConfirmation.ts";
import { loadDbEventsConfig } from "../_shared/config.ts";
import { errorResponse } from "../_shared/http/errors.ts";
import { parseRegistrationCreated } from "../_shared/http/registrationCreated.ts";
import {
  type WebhookHandler,
  withWebhookAuth,
} from "../_shared/http/webhook.ts";
import { createLogger, type Logger } from "../_shared/log.ts";
import type { Events } from "../_shared/ports/events.ts";
import type { Mailer } from "../_shared/ports/mailer.ts";
import type { Registrations } from "../_shared/ports/registrations.ts";

export type HandlerDependencies = {
  readonly events: Events;
  readonly registrations: Registrations;
  readonly mailer: Mailer;
  readonly siteUrl: string;
  readonly now: () => Date;
  readonly logger: Logger;
  readonly requestId: () => string;
  // Resolved per request so a missing secret fails closed, not at boot.
  readonly webhookSecret?: () => string;
};

export const createHandler = (
  dependencies: HandlerDependencies,
): WebhookHandler => {
  const registrationCreated = async (request: Request): Promise<Response> => {
    const { registrationId } = await parseRegistrationCreated(request);
    const outcome = await sendRegistrationConfirmation(
      { registrationId },
      dependencies,
      dependencies.now(),
    );
    return Response.json({ status: outcome.status });
  };
  // Kong strips /functions/v1 before forwarding; unit callers may retain it.
  const routes = new Map([
    ["/functions/v1/db-events/registration-created", registrationCreated],
    ["/db-events/registration-created", registrationCreated],
  ]);
  const handle = async (request: Request): Promise<Response> => {
    const requestId = dependencies.requestId();
    const headers = new Headers({ "x-request-id": requestId });
    const route = routes.get(new URL(request.url).pathname);
    let response: Response;
    try {
      if (route === undefined) {
        response = Response.json({ error: "NOT_FOUND" }, {
          status: 404,
          headers,
        });
      } else if (request.method !== "POST") {
        headers.set("allow", "POST");
        response = Response.json({ error: "METHOD_NOT_ALLOWED" }, {
          status: 405,
          headers,
        });
      } else {
        response = await route(request);
        response.headers.set("x-request-id", requestId);
      }
    } catch (error) {
      response = errorResponse(error, headers);
    }
    // Only status and method are logged: registration ids and addresses are
    // personal data and never reach the log.
    dependencies.logger.log(requestId, {
      event: response.status >= 400 ? "request.failed" : "request.completed",
      status: response.status,
      method: request.method,
    });
    return response;
  };
  return dependencies.webhookSecret === undefined
    ? withWebhookAuth(handle)
    : withWebhookAuth(handle, dependencies.webhookSecret);
};

if (import.meta.main) {
  const config = loadDbEventsConfig();
  const { createSupabasePorts } = await import(
    "../_shared/adapters/supabase/registrationPorts.ts"
  );
  const { createResendMailer } = await import(
    "../_shared/adapters/resend/mailer.ts"
  );
  Deno.serve(createHandler({
    ...createSupabasePorts({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    }),
    mailer: createResendMailer({
      apiKey: config.resendApiKey,
      from: config.mailFrom,
      replyTo: config.mailReplyTo,
      fetch: (input, init) => fetch(input, init),
    }),
    siteUrl: config.publicSiteUrl,
    now: () => new Date(),
    logger: createLogger(),
    requestId: () => crypto.randomUUID(),
  }));
}
