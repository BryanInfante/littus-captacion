import { assertEquals } from "./dev_deps.ts";
import { createLogger, type LogEntry } from "../_shared/log.ts";

const capture = (fields: Record<string, unknown>): LogEntry => {
  let entry: LogEntry = {};
  createLogger((e) => (entry = e)).log("req-1", fields);
  return entry;
};

Deno.test("logger allow-lists the operation field to its three literal values", () => {
  for (const operation of ["directory", "upload", "delete"]) {
    assertEquals(capture({ operation }).operation, operation);
  }
  assertEquals("operation" in capture({ operation: "/secret/path" }), false);
  assertEquals("operation" in capture({ operation: 5 }), false);
});

Deno.test("logger accepts the upload failure event and bounds status to 100-599", () => {
  const ok = capture({ event: "inspector.photo_upload_failed", status: 401 });
  assertEquals([ok.event, ok.status], ["inspector.photo_upload_failed", 401]);
  assertEquals("status" in capture({ status: 99 }), false);
  assertEquals("status" in capture({ status: 600 }), false);
});
