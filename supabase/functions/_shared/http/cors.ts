export const corsHeaders = (
  request: Request,
  publicSiteUrl: string,
): Headers => {
  const headers = new Headers({ vary: "Origin" });
  if (request.headers.get("origin") === publicSiteUrl) {
    headers.set("access-control-allow-origin", publicSiteUrl);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      "content-type, apikey, authorization",
    );
    // Cross-origin pages can read only safelisted headers unless exposed.
    headers.set("access-control-expose-headers", "retry-after");
  }
  return headers;
};
