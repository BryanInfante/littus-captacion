import { assertEquals } from "../dev_deps.ts";
import { acceptsRegistrations } from "../../_shared/domain/event.ts";
import { Email } from "../../_shared/domain/email.ts";
import { parseRegistrationName } from "../../_shared/domain/registration.ts";
import type { PublicEvent } from "../../../../public/js/core/api.js";
import {
  describeRegistrationError,
  isRegistrationOpen,
  normalizeEmail,
  pageStateFor,
  parseEventSlug,
  validateRegistration,
} from "../../../../public/js/inscripcion/model.js";

const NOW = new Date("2026-10-24T12:00:00Z");

const event = (
  opensAt: string | null,
  closesAt: string | null,
): PublicEvent => ({
  code: "webinar-scan-a",
  title: "Webinar",
  type: "webinar",
  summary: null,
  dateText: null,
  date: null,
  duration: null,
  registrationOpensAt: opensAt === null ? null : new Date(opensAt),
  registrationClosesAt: closesAt === null ? null : new Date(closesAt),
});

Deno.test("the event code comes from ?evento= and keeps the domain length bounds", () => {
  assertEquals(parseEventSlug(""), { kind: "missing" });
  assertEquals(parseEventSlug("?otro=1"), { kind: "missing" });
  assertEquals(parseEventSlug("?evento=%20%20"), { kind: "missing" });
  assertEquals(parseEventSlug("?evento=ab"), { kind: "invalid" });
  assertEquals(parseEventSlug(`?evento=${"a".repeat(81)}`), {
    kind: "invalid",
  });
  assertEquals(parseEventSlug("?evento=%20webinar-scan-a%20"), {
    kind: "code",
    code: "webinar-scan-a",
  });
  assertEquals(parseEventSlug(`?evento=${"a".repeat(80)}`), {
    kind: "code",
    code: "a".repeat(80),
  });
});

Deno.test("the page applies the same registration window as the domain", () => {
  // The catalog lists only active events, so every case here is active.
  const windows: [string | null, string | null][] = [
    [null, null],
    [null, "2026-11-01T00:00:00Z"],
    ["2026-10-01T00:00:00Z", null],
    ["2026-10-24T12:00:00Z", null],
    ["2026-10-24T12:00:00.001Z", null],
    ["2026-10-01T00:00:00Z", "2026-10-24T12:00:00Z"],
    ["2026-10-01T00:00:00Z", "2026-10-24T12:00:00.001Z"],
    ["2026-10-01T00:00:00Z", "2026-10-20T00:00:00Z"],
  ];
  for (const [opensAt, closesAt] of windows) {
    const candidate = event(opensAt, closesAt);
    assertEquals(
      isRegistrationOpen(candidate, NOW),
      acceptsRegistrations({
        code: candidate.code,
        active: true,
        registrationOpensAt: candidate.registrationOpensAt,
        registrationClosesAt: candidate.registrationClosesAt,
      }, NOW),
      `window ${opensAt} .. ${closesAt}`,
    );
  }
  assertEquals(
    isRegistrationOpen(event("2026-10-01T00:00:00Z", null), NOW),
    true,
  );
});

Deno.test("page state distinguishes not found, closed and open events", () => {
  const open = event("2026-10-01T00:00:00Z", null);
  const closed = event(null, null);
  assertEquals(pageStateFor(null, NOW), { kind: "not-found" });
  assertEquals(pageStateFor(closed, NOW), { kind: "closed", event: closed });
  assertEquals(pageStateFor(open, NOW), { kind: "open", event: open });
});

Deno.test("the email is normalized like the backend", () => {
  assertEquals(
    normalizeEmail("  Ana.Perez@Example.COM "),
    "ana.perez@example.com",
  );
});

Deno.test("form validation accepts and rejects exactly what the backend parses", () => {
  const backendAccepts = (name: string, email: string): boolean => {
    try {
      parseRegistrationName(name);
      Email.parse(email);
      return true;
    } catch {
      return false;
    }
  };
  const cases: [string, string][] = [
    ["Ana Pérez", "ana@example.com"],
    ["  Ana  ", " ANA@EXAMPLE.COM "],
    ["A", "ana@example.com"],
    ["", "ana@example.com"],
    ["   ", "ana@example.com"],
    ["ñ".repeat(120), "ana@example.com"],
    ["ñ".repeat(121), "ana@example.com"],
    ["😀😀", "ana@example.com"],
    ["Ana", ""],
    ["Ana", "ana"],
    ["Ana", "a@b.c"],
    ["Ana", "ana@example"],
    ["Ana", "ana pérez@example.com"],
    ["Ana", `${"a".repeat(242)}@example.com`],
    ["Ana", `${"a".repeat(243)}@example.com`],
  ];
  for (const [name, email] of cases) {
    const result = validateRegistration({
      name,
      email,
      marketingConsent: false,
    });
    assertEquals(
      result.ok,
      backendAccepts(name, email),
      `name ${JSON.stringify(name)}, email ${JSON.stringify(email)}`,
    );
  }
});

Deno.test("valid input is trimmed and normalized into the request values", () => {
  assertEquals(
    validateRegistration({
      name: "  Ana Pérez ",
      email: " Ana@Example.com ",
      marketingConsent: true,
    }),
    {
      ok: true,
      values: {
        name: "Ana Pérez",
        email: "ana@example.com",
        marketingConsent: true,
      },
    },
  );
});

Deno.test("each invalid field gets its own message", () => {
  assertEquals(
    validateRegistration({ name: "", email: "", marketingConsent: false }),
    {
      ok: false,
      errors: {
        name: "Escribe tu nombre.",
        email: "Escribe tu correo electrónico.",
      },
    },
  );
  assertEquals(
    validateRegistration({
      name: "A",
      email: "ana@example",
      marketingConsent: false,
    }),
    {
      ok: false,
      errors: {
        name: "El nombre debe tener al menos 2 caracteres.",
        email: "Escribe un correo válido, por ejemplo nombre@empresa.com.",
      },
    },
  );
  assertEquals(
    validateRegistration({
      name: "a".repeat(121),
      email: `${"a".repeat(244)}@example.com`,
      marketingConsent: false,
    }),
    {
      ok: false,
      errors: {
        name: "El nombre puede tener hasta 120 caracteres.",
        email: "El correo puede tener hasta 254 caracteres.",
      },
    },
  );
});

Deno.test("every registration error maps to a message next to its field or in the status", () => {
  const failure = (
    error: Parameters<typeof describeRegistrationError>[0]["error"],
    retryAfterSeconds: number | null = null,
  ) => describeRegistrationError({ ok: false, error, retryAfterSeconds });

  assertEquals(failure("ALREADY_REGISTERED"), {
    target: "email",
    message: "Este correo ya está inscrito en este evento.",
  });
  assertEquals(failure("CHALLENGE_FAILED"), {
    target: "challenge",
    message:
      "No pudimos confirmar la verificación de seguridad. Complétala de nuevo y vuelve a enviar.",
  });
  assertEquals(failure("INVALID_INPUT"), {
    target: "status",
    title: "Revisa tus datos",
    message:
      "Algún dato no tiene el formato esperado. Corrige el nombre y el correo e inténtalo de nuevo.",
  });
  assertEquals(failure("EVENT_NOT_FOUND"), {
    target: "status",
    title: "Evento no disponible",
    message: "Este evento ya no está disponible para inscripciones.",
  });
  assertEquals(failure("REGISTRATION_CLOSED"), {
    target: "status",
    title: "Inscripciones cerradas",
    message: "Las inscripciones para este evento se cerraron.",
  });
  assertEquals(failure("INTERNAL_ERROR"), {
    target: "status",
    title: "No pudimos registrar tu inscripción",
    message:
      "Ocurrió un problema en el servidor. Inténtalo de nuevo en unos minutos.",
  });
  assertEquals(failure("UNEXPECTED_RESPONSE"), {
    target: "status",
    title: "No pudimos registrar tu inscripción",
    message:
      "Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.",
  });
  assertEquals(failure("NETWORK_ERROR"), {
    target: "status",
    title: "No pudimos conectar",
    message: "Revisa tu conexión a internet e inténtalo de nuevo.",
  });
});

Deno.test("a rate-limited request shows how long to wait", () => {
  const wait = (seconds: number | null) =>
    describeRegistrationError({
      ok: false,
      error: "RATE_LIMITED",
      retryAfterSeconds: seconds,
    });
  const status = (message: string) => ({
    target: "status" as const,
    title: "Demasiados intentos",
    message,
  });
  assertEquals(
    wait(1),
    status("Espera 1 segundo antes de volver a intentarlo."),
  );
  assertEquals(
    wait(43),
    status("Espera 43 segundos antes de volver a intentarlo."),
  );
  assertEquals(
    wait(60),
    status("Espera 1 minuto antes de volver a intentarlo."),
  );
  assertEquals(
    wait(61),
    status("Espera 2 minutos antes de volver a intentarlo."),
  );
  assertEquals(
    wait(3600),
    status("Espera 60 minutos antes de volver a intentarlo."),
  );
  assertEquals(
    wait(null),
    status("Espera unos minutos antes de volver a intentarlo."),
  );
});
