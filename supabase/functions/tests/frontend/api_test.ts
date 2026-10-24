import { assertEquals, assertRejects } from "../dev_deps.ts";
import {
  CatalogUnavailableError,
  createApiClient,
  type RegistrationError,
} from "../../../../public/js/core/api.js";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "../../../../public/js/core/config.js";

type Call = { url: URL; init: RequestInit | undefined };

const recordingFetch = (respond: () => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetchFn = (input: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url: new URL(input), init });
    return Promise.resolve(respond());
  };
  return { calls, fetchFn };
};

const CATALOG_ROW = {
  masterclass_codigo: "webinar-scan-a",
  event_title: "Webinar de ultrasonido",
  tipo: "webinar",
  resumen: "Un párrafo.",
  fecha_texto: "5 de noviembre de 2026",
  fecha_evento: "2026-11-05",
  duracion: "2 horas",
  inscripcion_abre_en: "2026-10-01T00:00:00+00:00",
  inscripcion_cierra_en: null,
};

Deno.test("fetchPublicEvent reads one row of the catalog view with the publishable key", async () => {
  const { calls, fetchFn } = recordingFetch(() => Response.json([CATALOG_ROW]));
  const event = await createApiClient(fetchFn).fetchPublicEvent(
    "webinar-scan-a",
  );

  assertEquals(event, {
    code: "webinar-scan-a",
    title: "Webinar de ultrasonido",
    type: "webinar",
    summary: "Un párrafo.",
    dateText: "5 de noviembre de 2026",
    date: "2026-11-05",
    duration: "2 horas",
    registrationOpensAt: new Date("2026-10-01T00:00:00Z"),
    registrationClosesAt: null,
  });
  assertEquals(calls.length, 1);
  const [{ url, init }] = calls;
  assertEquals(
    `${url.origin}${url.pathname}`,
    `${SUPABASE_URL}/rest/v1/eccia_eventos_publicos`,
  );
  assertEquals(url.searchParams.get("masterclass_codigo"), "eq.webinar-scan-a");
  assertEquals(
    url.searchParams.get("select"),
    "masterclass_codigo,event_title,tipo,resumen,fecha_texto,fecha_evento,duracion,inscripcion_abre_en,inscripcion_cierra_en",
  );
  const headers = new Headers(init?.headers);
  assertEquals(headers.get("apikey"), SUPABASE_PUBLISHABLE_KEY);
  assertEquals(headers.get("authorization"), null);
  assertEquals(init?.method ?? "GET", "GET");
});

Deno.test("fetchPublicEvent encodes the code as a single eq filter value", async () => {
  const { calls, fetchFn } = recordingFetch(() => Response.json([]));
  await createApiClient(fetchFn).fetchPublicEvent("a&select=*,b");
  assertEquals(
    calls[0].url.searchParams.get("masterclass_codigo"),
    "eq.a&select=*,b",
  );
  assertEquals(calls[0].url.searchParams.getAll("select").length, 1);
});

Deno.test("fetchPublicEvent returns null when the catalog has no such active event", async () => {
  const { fetchFn } = recordingFetch(() => Response.json([]));
  assertEquals(
    await createApiClient(fetchFn).fetchPublicEvent("no-existe"),
    null,
  );
});

Deno.test("fetchPublicEvent keeps nullable catalog fields as null", async () => {
  const { fetchFn } = recordingFetch(() =>
    Response.json([{
      ...CATALOG_ROW,
      tipo: null,
      resumen: null,
      fecha_texto: null,
      fecha_evento: null,
      duracion: null,
      inscripcion_abre_en: null,
    }])
  );
  const event = await createApiClient(fetchFn).fetchPublicEvent(
    "webinar-scan-a",
  );
  assertEquals(event?.type, null);
  assertEquals(event?.summary, null);
  assertEquals(event?.registrationOpensAt, null);
});

Deno.test("fetchPublicEvent fails closed on transport, status and shape errors", async (t) => {
  const failures: [string, () => Response | Promise<Response>][] = [
    ["network failure", () => Promise.reject(new TypeError("offline"))],
    ["server error", () => new Response("boom", { status: 503 })],
    [
      "permission denied",
      () => Response.json({ code: "42501" }, { status: 401 }),
    ],
    ["invalid JSON", () => new Response("<html>", { status: 200 })],
    ["object instead of rows", () => Response.json({ rows: [] })],
    ["two rows for one key", () => Response.json([CATALOG_ROW, CATALOG_ROW])],
    ["unknown type", () => Response.json([{ ...CATALOG_ROW, tipo: "taller" }])],
    [
      "missing title",
      () => Response.json([{ ...CATALOG_ROW, event_title: undefined }]),
    ],
    [
      "bad timestamp",
      () => Response.json([{ ...CATALOG_ROW, inscripcion_abre_en: "ayer" }]),
    ],
    [
      "another event",
      () => Response.json([{ ...CATALOG_ROW, masterclass_codigo: "otro" }]),
    ],
  ];
  for (const [name, respond] of failures) {
    await t.step(name, async () => {
      const { fetchFn } = recordingFetch(respond);
      await assertRejects(
        () => createApiClient(fetchFn).fetchPublicEvent("webinar-scan-a"),
        CatalogUnavailableError,
      );
    });
  }
});

const REGISTRATION = {
  eventCode: "webinar-scan-a",
  name: "Ana Pérez",
  email: "ana@example.com",
  marketingConsent: true,
  challengeToken: "token-1",
};

Deno.test("register posts the registration contract to public-api", async () => {
  const { calls, fetchFn } = recordingFetch(() =>
    Response.json({ id: "1", event_code: "webinar-scan-a" }, { status: 201 })
  );
  const result = await createApiClient(fetchFn).register(REGISTRATION);

  assertEquals(result, { ok: true });
  const [{ url, init }] = calls;
  assertEquals(
    url.href,
    `${SUPABASE_URL}/functions/v1/public-api/registrations`,
  );
  assertEquals(init?.method, "POST");
  const headers = new Headers(init?.headers);
  assertEquals(headers.get("content-type"), "application/json");
  // CORS on public-api allows only content-type, apikey and authorization;
  // the function does not verify a JWT, so no key travels with the request.
  assertEquals(headers.get("apikey"), null);
  assertEquals(headers.get("authorization"), null);
  assertEquals(JSON.parse(String(init?.body)), {
    event_code: "webinar-scan-a",
    nombre: "Ana Pérez",
    correo: "ana@example.com",
    marketing_consent: true,
    challenge_token: "token-1",
  });
});

Deno.test("register maps each documented error to a typed result", async (t) => {
  const cases: [number, string, RegistrationError][] = [
    [400, "INVALID_INPUT", "INVALID_INPUT"],
    [403, "CHALLENGE_FAILED", "CHALLENGE_FAILED"],
    [404, "EVENT_NOT_FOUND", "EVENT_NOT_FOUND"],
    [409, "ALREADY_REGISTERED", "ALREADY_REGISTERED"],
    [409, "REGISTRATION_CLOSED", "REGISTRATION_CLOSED"],
    [500, "INTERNAL_ERROR", "INTERNAL_ERROR"],
  ];
  for (const [status, code, expected] of cases) {
    await t.step(`${status} ${code}`, async () => {
      const { fetchFn } = recordingFetch(() =>
        Response.json({ error: code }, { status })
      );
      assertEquals(await createApiClient(fetchFn).register(REGISTRATION), {
        ok: false,
        error: expected,
        retryAfterSeconds: null,
      });
    });
  }
});

Deno.test("register reads the retry wait of a rate-limited request", async (t) => {
  const cases: [string | null, number | null][] = [
    ["43", 43],
    ["3600", 3600],
    [null, null],
    ["0", null],
    ["-5", null],
    ["soon", null],
    ["Wed, 21 Oct 2026 07:28:00 GMT", null],
  ];
  for (const [header, expected] of cases) {
    await t.step(`retry-after ${header}`, async () => {
      const headers = new Headers();
      if (header !== null) headers.set("retry-after", header);
      const { fetchFn } = recordingFetch(() =>
        Response.json({ error: "RATE_LIMITED" }, { status: 429, headers })
      );
      assertEquals(await createApiClient(fetchFn).register(REGISTRATION), {
        ok: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: expected,
      });
    });
  }
});

Deno.test("register classifies responses outside the contract", async (t) => {
  const cases: [
    string,
    () => Response | Promise<Response>,
    RegistrationError,
  ][] = [
    [
      "network failure",
      () => Promise.reject(new TypeError("offline")),
      "NETWORK_ERROR",
    ],
    [
      "gateway error without body",
      () => new Response("", { status: 502 }),
      "INTERNAL_ERROR",
    ],
    [
      "429 without body",
      () => new Response("", { status: 429 }),
      "RATE_LIMITED",
    ],
    [
      "unknown code",
      () => Response.json({ error: "NOPE" }, { status: 400 }),
      "UNEXPECTED_RESPONSE",
    ],
    [
      "code with the wrong status",
      () => Response.json({ error: "ALREADY_REGISTERED" }, { status: 400 }),
      "UNEXPECTED_RESPONSE",
    ],
    [
      "gateway 401",
      () => Response.json({ msg: "unauthorized" }, { status: 401 }),
      "UNEXPECTED_RESPONSE",
    ],
    [
      "success with another status",
      () => Response.json({ id: "1" }, { status: 200 }),
      "UNEXPECTED_RESPONSE",
    ],
  ];
  for (const [name, respond, expected] of cases) {
    await t.step(name, async () => {
      const { fetchFn } = recordingFetch(respond);
      assertEquals(await createApiClient(fetchFn).register(REGISTRATION), {
        ok: false,
        error: expected,
        retryAfterSeconds: null,
      });
    });
  }
});
