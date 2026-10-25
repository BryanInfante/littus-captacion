import { assertEquals, assertThrows } from "../dev_deps.ts";
import { parseDbEventsConfig } from "../../_shared/config.ts";

const env = (): Record<string, string | undefined> => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-fixture",
  PUBLIC_SITE_URL: "https://site.example.invalid/",
  RESEND_API_KEY: "re_fixture",
  MAIL_FROM: "Sender <sender@example.invalid>",
  MAIL_REPLY_TO: "reply@example.invalid",
});

Deno.test("db-events config reads only what the group needs", () => {
  assertEquals(parseDbEventsConfig(env()), {
    supabaseUrl: "http://127.0.0.1:54321",
    supabaseServiceRoleKey: "local-service-role-fixture",
    publicSiteUrl: "https://site.example.invalid",
    resendApiKey: "re_fixture",
    mailFrom: "Sender <sender@example.invalid>",
    mailReplyTo: "reply@example.invalid",
  });
});

Deno.test("db-events config does not require unrelated public-api secrets", () => {
  const config = parseDbEventsConfig({
    ...env(),
    TURNSTILE_SECRET_KEY: undefined,
    REQUEST_LIMIT_HASH_SECRET: undefined,
  });
  assertEquals(config.resendApiKey, "re_fixture");
});

Deno.test("db-events config fails fast naming each missing variable", () => {
  for (
    const variable of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "PUBLIC_SITE_URL",
      "RESEND_API_KEY",
      "MAIL_FROM",
      "MAIL_REPLY_TO",
    ]
  ) {
    for (const value of [undefined, "", "   "]) {
      assertThrows(
        () => parseDbEventsConfig({ ...env(), [variable]: value }),
        Error,
        variable,
      );
    }
  }
});

Deno.test("db-events config rejects a public site that is not an HTTPS origin", () => {
  assertThrows(
    () =>
      parseDbEventsConfig({
        ...env(),
        PUBLIC_SITE_URL: "http://site.example.invalid",
      }),
    Error,
    "PUBLIC_SITE_URL",
  );
});
