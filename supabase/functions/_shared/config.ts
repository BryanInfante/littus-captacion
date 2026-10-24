export type Config = {
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly publicSiteUrl: string;
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
});

export const loadConfig = (): Config => parseConfig(Deno.env.toObject());
