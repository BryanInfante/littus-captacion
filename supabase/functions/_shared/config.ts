export type Config = {
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly publicSiteUrl: string;
  // Separate secrets: rotating Turnstile never changes the request limit keys.
  readonly turnstileSecretKey: string;
  readonly requestLimitHashSecret: string;
};

export type InspectorStorageConfig = {
  readonly webdavUrl: string;
  readonly username: string;
  readonly appPassword: string;
  readonly rootDirectory: string;
};

export type WebhookConfig = {
  readonly webhookSecret: string;
};

type Environment = Readonly<Record<string, string | undefined>>;

const invalid = (variable: string): Error =>
  new Error(`Missing or invalid environment variable: ${variable}`);

const required = (env: Environment, variable: string): string => {
  const value = env[variable]?.trim();
  if (value === undefined || value.length === 0) throw invalid(variable);
  return value;
};

// The platform injects SUPABASE_URL; the local edge runtime uses its internal
// gateway over plain HTTP (http://kong:8000). PUBLIC_SITE_URL becomes the CORS
// origin, so it must be HTTPS except on a developer machine.
const anyHttp = (url: URL): boolean =>
  url.protocol === "https:" || url.protocol === "http:";

const httpsOrLocal = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1"));

const origin = (
  value: string,
  variable: string,
  allowedScheme: (url: URL) => boolean,
): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid(variable);
  }
  if (
    !allowedScheme(url) || url.hostname === "" ||
    url.username !== "" || url.password !== "" || url.pathname !== "/" ||
    value.includes("?") || value.includes("#")
  ) {
    throw invalid(variable);
  }
  return url.origin;
};

const serviceRoleKey = (env: Environment): string => {
  if (env.SUPABASE_SECRET_KEYS !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.SUPABASE_SECRET_KEYS);
    } catch {
      throw invalid("SUPABASE_SECRET_KEYS");
    }
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) {
      throw invalid("SUPABASE_SECRET_KEYS");
    }
    if ("default" in parsed) {
      if (typeof parsed.default !== "string" || parsed.default.trim() === "") {
        throw invalid("SUPABASE_SECRET_KEYS");
      }
      return parsed.default.trim();
    }
  }
  return required(env, "SUPABASE_SERVICE_ROLE_KEY");
};

export const parseConfig = (env: Environment): Config => ({
  supabaseUrl: origin(required(env, "SUPABASE_URL"), "SUPABASE_URL", anyHttp),
  supabaseServiceRoleKey: serviceRoleKey(env),
  publicSiteUrl: origin(
    required(env, "PUBLIC_SITE_URL"),
    "PUBLIC_SITE_URL",
    httpsOrLocal,
  ),
  turnstileSecretKey: required(env, "TURNSTILE_SECRET_KEY"),
  requestLimitHashSecret: required(env, "REQUEST_LIMIT_HASH_SECRET"),
});

export const loadConfig = (): Config => parseConfig(Deno.env.toObject());

// Loaded only by public-api's ficha adapter so unrelated functions do not gain
// new required secrets during rolling deployments.
export const parseInspectorStorageConfig = (
  env: Environment,
): InspectorStorageConfig => {
  const rawUrl = required(env, "NEXTCLOUD_WEBDAV_URL");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw invalid("NEXTCLOUD_WEBDAV_URL");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") || url.username ||
    url.password || url.search || url.hash
  ) {
    throw invalid("NEXTCLOUD_WEBDAV_URL");
  }
  const rootDirectory = required(env, "NEXTCLOUD_ROOT_DIR").replace(/\/$/, "");
  if (
    !rootDirectory.split("/").every((segment) =>
      /^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*$/.test(segment)
    )
  ) {
    throw invalid("NEXTCLOUD_ROOT_DIR");
  }
  return {
    webdavUrl: rawUrl.replace(/\/$/, ""),
    username: required(env, "NEXTCLOUD_USERNAME"),
    appPassword: required(env, "NEXTCLOUD_APP_PASSWORD"),
    rootDirectory,
  };
};

export const loadInspectorStorageConfig = (): InspectorStorageConfig =>
  parseInspectorStorageConfig(Deno.env.toObject());

export const parseWebhookConfig = (
  env: Readonly<Record<string, string | undefined>>,
): WebhookConfig => ({
  webhookSecret: required(env, "ECCIA_WEBHOOK_SECRET"),
});

export const loadWebhookConfig = (): WebhookConfig =>
  parseWebhookConfig(Deno.env.toObject());

export type DbEventsConfig = {
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly publicSiteUrl: string;
  readonly resendApiKey: string;
  readonly mailFrom: string;
  readonly mailReplyTo: string;
};

// Loaded only by the db-events group so it does not inherit public-api
// secrets (Turnstile, request limits) it never uses.
export const parseDbEventsConfig = (env: Environment): DbEventsConfig => ({
  supabaseUrl: origin(required(env, "SUPABASE_URL"), "SUPABASE_URL", anyHttp),
  supabaseServiceRoleKey: serviceRoleKey(env),
  publicSiteUrl: origin(
    required(env, "PUBLIC_SITE_URL"),
    "PUBLIC_SITE_URL",
    httpsOrLocal,
  ),
  resendApiKey: required(env, "RESEND_API_KEY"),
  mailFrom: required(env, "MAIL_FROM"),
  mailReplyTo: required(env, "MAIL_REPLY_TO"),
});

export const loadDbEventsConfig = (): DbEventsConfig =>
  parseDbEventsConfig(Deno.env.toObject());
