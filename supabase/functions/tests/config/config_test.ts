import { assertEquals, assertThrows } from "../dev_deps.ts";
import { parseConfig } from "../../_shared/config.ts";

const env = (): Record<string, string | undefined> => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-fixture",
  PUBLIC_SITE_URL: "https://site.example.invalid",
});

Deno.test("config prefers the default secret from SUPABASE_SECRET_KEYS JSON", () => {
  const config = parseConfig({
    ...env(),
    SUPABASE_SECRET_KEYS: '{"default":"preferred-secret","other":"ignored"}',
  });
  assertEquals(config.supabaseServiceRoleKey, "preferred-secret");
  assertEquals(config.supabaseUrl, "http://127.0.0.1:54321");
  assertEquals(config.publicSiteUrl, "https://site.example.invalid");
});

Deno.test("config falls back to the legacy service role key when JSON or default is absent", () => {
  for (const secrets of [undefined, "{}", '{"other":"ignored"}']) {
    assertEquals(
      parseConfig({ ...env(), SUPABASE_SECRET_KEYS: secrets })
        .supabaseServiceRoleKey,
      "local-service-role-fixture",
    );
  }
});

Deno.test("config accepts secret keys JSON without the legacy key", () => {
  assertEquals(
    parseConfig({
      ...env(),
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_SECRET_KEYS: '{"default":"preferred-secret"}',
    }).supabaseServiceRoleKey,
    "preferred-secret",
  );
});

Deno.test("config fails fast naming each missing required variable", () => {
  for (
    const variable of [
      "SUPABASE_URL",
      "PUBLIC_SITE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) {
    for (const value of [undefined, "", "   "]) {
      assertThrows(
        () => parseConfig({ ...env(), [variable]: value }),
        Error,
        variable,
      );
    }
  }
});

Deno.test("config rejects malformed secret JSON and invalid default values without leaking secrets", () => {
  for (
    const value of [
      "{private-secret",
      "null",
      "[]",
      '{"default":42}',
      '{"default":""}',
      '{"default":"   "}',
    ]
  ) {
    const error = assertThrows(
      () => parseConfig({ ...env(), SUPABASE_SECRET_KEYS: value }),
      Error,
      "SUPABASE_SECRET_KEYS",
    );
    if (!(error instanceof Error)) {
      throw new Error("Expected Error", { cause: error });
    }
    assertEquals(error.message.includes("private-secret"), false);
  }
});

Deno.test("config accepts HTTPS origins and local HTTP origins", () => {
  for (
    const origin of [
      "https://site.example.invalid",
      "https://site.example.invalid:8443",
      "http://localhost:3000",
      "http://127.0.0.1:8000",
    ]
  ) {
    assertEquals(
      parseConfig({ ...env(), PUBLIC_SITE_URL: origin }).publicSiteUrl,
      origin,
    );
  }
  assertEquals(
    parseConfig({ ...env(), PUBLIC_SITE_URL: "https://site.example.invalid/" })
      .publicSiteUrl,
    "https://site.example.invalid",
  );
});

Deno.test("config rejects non-origin insecure and deceptive PUBLIC_SITE_URL values", () => {
  for (
    const value of [
      "not-a-url",
      "http://site.example.invalid",
      "ftp://site.example.invalid",
      "https://user:pass@site.example.invalid",
      "https://site.example.invalid/path",
      "https://site.example.invalid?query=1",
      "https://site.example.invalid#fragment",
      "http://localhost.evil.invalid",
      "http://127.0.0.1.evil.invalid",
      "//site.example.invalid",
    ]
  ) {
    assertThrows(
      () => parseConfig({ ...env(), PUBLIC_SITE_URL: value }),
      Error,
      "PUBLIC_SITE_URL",
    );
  }
});

Deno.test("config accepts the platform SUPABASE_URL of the local edge runtime", () => {
  // `supabase functions serve` injects the internal gateway over plain HTTP.
  assertEquals(
    parseConfig({ ...env(), SUPABASE_URL: "http://kong:8000" }).supabaseUrl,
    "http://kong:8000",
  );
});

Deno.test("config rejects invalid SUPABASE_URL values", () => {
  for (
    const value of [
      "not-a-url",
      "ftp://example.invalid",
      "https://user:pass@example.invalid",
    ]
  ) {
    assertThrows(
      () => parseConfig({ ...env(), SUPABASE_URL: value }),
      Error,
      "SUPABASE_URL",
    );
  }
});
