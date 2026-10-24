import { assertEquals, assertThrows } from "../dev_deps.ts";
import { parseWebhookConfig } from "../../_shared/config.ts";
import { withWebhookAuth } from "../../_shared/http/webhook.ts";

const SECRET = "fixture-webhook-secreto-\u00f1";
const ROUTE = "https://edge.example.invalid/functions/v1/webhook";

const request = (secret?: string, body = "{invalid json") => {
  const headers = new Headers();
  if (secret !== undefined) headers.set("x-eccia-webhook-secret", secret);
  return new Request(ROUTE, { method: "POST", headers, body });
};

Deno.test("webhook configuration requires a nonblank secret and trims it", () => {
  assertEquals(
    parseWebhookConfig({ ECCIA_WEBHOOK_SECRET: ` ${SECRET} ` }),
    { webhookSecret: SECRET },
  );

  for (const value of [undefined, "", "   ", "\t\n"]) {
    const error = assertThrows(
      () => parseWebhookConfig({ ECCIA_WEBHOOK_SECRET: value }),
      Error,
      "ECCIA_WEBHOOK_SECRET",
    );
    assertEquals(error.message.includes(SECRET), false);
  }
});

Deno.test("webhook guard rejects invalid credentials before consuming body", async () => {
  let callbackCount = 0;
  const guard = withWebhookAuth(() => {
    callbackCount++;
    return new Response("accepted");
  }, () => SECRET);

  for (
    const suppliedSecret of [
      undefined,
      "",
      "   ",
      "fixture-webhook-secreto-\u00f3",
      "short",
    ]
  ) {
    const incoming = request(suppliedSecret);
    const response = await guard(incoming);

    assertEquals(response.status, 401);
    assertEquals(await response.text(), '{"error":"UNAUTHORIZED"}');
    assertEquals(incoming.bodyUsed, false);
  }

  assertEquals(callbackCount, 0);
});

Deno.test("missing webhook configuration fails closed without exposing details", async () => {
  let callbackCount = 0;
  const guard = withWebhookAuth(() => {
    callbackCount++;
    return new Response("accepted");
  }, () => {
    throw new Error(`Missing fixture secret: ${SECRET}`);
  });
  const incoming = request(SECRET);
  const response = await guard(incoming);
  const body = await response.text();

  assertEquals(response.status, 503);
  assertEquals(body, '{"error":"SERVICE_UNAVAILABLE"}');
  assertEquals(body.includes(SECRET), false);
  assertEquals(incoming.bodyUsed, false);
  assertEquals(callbackCount, 0);

  const blankConfig = await withWebhookAuth(
    () => new Response("accepted"),
    () => "   ",
  )(request(SECRET));
  assertEquals(blankConfig.status, 503);
});

Deno.test("valid webhook credentials call through once and preserve the response", async () => {
  let callbackCount = 0;
  const downstreamResponse = new Response("accepted", {
    status: 202,
    headers: { "x-downstream": "preserved" },
  });
  const guard = withWebhookAuth(() => {
    callbackCount++;
    return downstreamResponse;
  }, () => SECRET);
  const response = await guard(request(SECRET));

  assertEquals(callbackCount, 1);
  assertEquals(response, downstreamResponse);
  assertEquals(response.status, 202);
  assertEquals(response.headers.get("x-downstream"), "preserved");
  assertEquals(await response.text(), "accepted");
});

Deno.test("webhook secret resolution is lazy until a request arrives", () => {
  let resolutionCount = 0;
  withWebhookAuth(() => new Response("accepted"), () => {
    resolutionCount++;
    return SECRET;
  });

  assertEquals(resolutionCount, 0);
});
