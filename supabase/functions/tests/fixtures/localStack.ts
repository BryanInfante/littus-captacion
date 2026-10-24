// The CLI's public local-development signing secret, not a project credential.
// A locally minted service-role JWT also avoids committing an expiring token.
export const localServiceRoleKey = async (): Promise<string> => {
  const encode = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replaceAll("+", "-")
      .replaceAll("/", "_").replaceAll("=", "");
  const json = (value: unknown) =>
    encode(new TextEncoder().encode(JSON.stringify(value)));
  const payload = `${json({ alg: "HS256", typ: "JWT" })}.${
    json({
      iss: "supabase-demo",
      role: "service_role",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  }`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(
      "super-secret-jwt-token-with-at-least-32-characters-long",
    ),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encode(new Uint8Array(signature))}`;
};
