import { registerForEvent } from "../_shared/application/registerForEvent.ts";
import { loadConfig } from "../_shared/config.ts";
import { corsHeaders } from "../_shared/http/cors.ts";
import { errorResponse } from "../_shared/http/errors.ts";
import { parseRegistrationRequest } from "../_shared/http/registration.ts";
import { createLogger, type Logger } from "../_shared/log.ts";
import type { Events } from "../_shared/ports/events.ts";
import type { Registrations } from "../_shared/ports/registrations.ts";

export type HandlerDependencies = {
  readonly events: Events;
  readonly registrations: Registrations;
  readonly now: () => Date;
  readonly publicSiteUrl: string;
  readonly logger: Logger;
  readonly requestId: () => string;
};

export const createHandler = (
  dependencies: HandlerDependencies,
): (request: Request) => Promise<Response> => {
  const register = async (
    request: Request,
    headers: Headers,
  ): Promise<Response> => {
    const input = await parseRegistrationRequest(request);
    const created = await registerForEvent(
      input,
      dependencies,
      dependencies.now(),
    );
    return Response.json({ id: created.id, event_code: created.eventCode }, {
      status: 201,
      headers,
    });
  };
  // Kong strips /functions/v1 before forwarding; unit callers may retain it.
  const routes = new Map([
    ["/functions/v1/public-api/registrations", register],
    ["/public-api/registrations", register],
  ]);
  return async (request) => {
    const requestId = dependencies.requestId();
    const headers = corsHeaders(request, dependencies.publicSiteUrl);
    headers.set("x-request-id", requestId);
    const route = routes.get(new URL(request.url).pathname);
    let response: Response;
    try {
      if (route === undefined) {
        response = Response.json({ error: "NOT_FOUND" }, {
          status: 404,
          headers,
        });
      } else if (request.method === "OPTIONS") {
        response = new Response(null, { status: 204, headers });
      } else if (request.method !== "POST") {
        headers.set("allow", "POST, OPTIONS");
        response = Response.json({ error: "METHOD_NOT_ALLOWED" }, {
          status: 405,
          headers,
        });
      } else {
        response = await route(request, headers);
      }
    } catch (error) {
      response = errorResponse(error, headers);
    }
    dependencies.logger.log(requestId, {
      event: response.status === 201
        ? "registration.created"
        : response.status >= 400
        ? "request.failed"
        : "request.completed",
      status: response.status,
      method: request.method,
      path: route === undefined ? "unmatched" : "/registrations",
    });
    return response;
  };
};

if (import.meta.main) {
  const config = loadConfig();
  const { createSupabasePorts } = await import(
    "../_shared/adapters/supabase/registrationPorts.ts"
  );
  Deno.serve(createHandler({
    ...createSupabasePorts({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    }),
    now: () => new Date(),
    publicSiteUrl: config.publicSiteUrl,
    requestId: () => crypto.randomUUID(),
    logger: createLogger(),
  }));
}
