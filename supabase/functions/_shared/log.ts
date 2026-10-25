export type LogEntry = Readonly<Record<string, unknown>>;
export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  log(requestId: string, fields: Readonly<Record<string, unknown>>): void;
}

const EVENTS = new Set([
  "challenge.unavailable",
  "registration.created",
  "request.completed",
  "request.failed",
  "inspector.photo_upload_failed",
  "inspector.photo_orphaned",
  "inspector.profile_cleanup_failed",
]);
const METHODS = new Set([
  "POST",
  "OPTIONS",
  "GET",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
]);
const OPERATIONS = new Set(["directory", "upload", "delete"]);
const PATHS = new Set(["/registrations", "unmatched"]);

export const createLogger = (
  sink: LogSink = (entry) => console.info(JSON.stringify(entry)),
): Logger => ({
  log: (requestId, fields) => {
    // Allow-list values as well as keys: a raw URL, arbitrary error message,
    // or object must never be smuggled into a nominally safe field.
    const entry: Record<string, unknown> = {
      requestId: /^[a-zA-Z0-9_-]{1,128}$/.test(requestId)
        ? requestId
        : "invalid-request-id",
    };
    if (typeof fields.event === "string" && EVENTS.has(fields.event)) {
      entry.event = fields.event;
    }
    if (
      typeof fields.status === "number" && Number.isInteger(fields.status) &&
      fields.status >= 100 && fields.status <= 599
    ) {
      entry.status = fields.status;
    }
    if (typeof fields.method === "string" && METHODS.has(fields.method)) {
      entry.method = fields.method;
    }
    if (
      typeof fields.operation === "string" && OPERATIONS.has(fields.operation)
    ) {
      entry.operation = fields.operation;
    }
    if (typeof fields.path === "string" && PATHS.has(fields.path)) {
      entry.path = fields.path;
    }
    try {
      sink(Object.freeze(entry));
    } catch {
      // A logging outage must not turn a committed registration into a 500.
    }
  },
});
