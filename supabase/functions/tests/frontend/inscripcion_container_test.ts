/// <reference lib="dom" />
import { assertEquals } from "../dev_deps.ts";
import type {
  PublicEvent,
  RegistrationRequest,
  RegistrationResult,
} from "../../../../public/js/core/api.js";
import type { Challenge } from "../../../../public/js/core/turnstile.js";
import { startRegistrationPage } from "../../../../public/js/inscripcion/container.js";
import { byId, type FakePage, loadRegistrationPage } from "./fake_dom.ts";

const NOW = new Date("2026-10-24T12:00:00Z");

const OPEN_EVENT: PublicEvent = {
  code: "webinar-scan-a",
  title: "Webinar de ultrasonido",
  type: "webinar",
  summary: null,
  dateText: null,
  date: null,
  duration: null,
  registrationOpensAt: new Date("2026-10-01T00:00:00Z"),
  registrationClosesAt: null,
  requiresInspectorProfile: false,
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Lets pending promise callbacks (fetch, render, submit) run to completion.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Options = {
  search?: string;
  inspector?: boolean;
  catalog?: () => Promise<PublicEvent | null>;
  register?: (request: RegistrationRequest) => Promise<RegistrationResult>;
  challenge?: () => Promise<Challenge>;
};

const start = async (options: Options = {}) => {
  const page = await loadRegistrationPage();
  const catalogCalls: string[] = [];
  const registrations: RegistrationRequest[] = [];
  const challengeSlots: HTMLElement[] = [];
  let token: string | null = "token-1";
  let resets = 0;
  const challenge: Challenge = {
    token: () => token,
    reset: () => {
      resets += 1;
      token = null;
    },
  };
  await startRegistrationPage({
    document: page.document,
    search: options.search ?? "?evento=webinar-scan-a",
    now: () => NOW,
    api: {
      fetchPublicEvent: (code) => {
        catalogCalls.push(code);
        return options.catalog?.() ?? Promise.resolve({
          ...OPEN_EVENT,
          requiresInspectorProfile: options.inspector ?? false,
        });
      },
      register: (request) => {
        registrations.push(request);
        return options.register?.(request) ??
          Promise.resolve({ ok: true });
      },
    },
    loadChallenge: (slot) => {
      challengeSlots.push(slot);
      return options.challenge?.() ?? Promise.resolve(challenge);
    },
  });
  await settle();
  return {
    page,
    catalogCalls,
    registrations,
    challengeSlots,
    resets: () => resets,
    setToken: (value: string | null) => {
      token = value;
    },
  };
};

const text = (element: Element | null): string =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

const heading = (page: FakePage) =>
  text(byId(page.document, "inscripcion-titulo"));

const input = (page: FakePage, id: string) =>
  byId(page.document, id) as HTMLInputElement;

const fillForm = (page: FakePage) => {
  input(page, "nombre").value = "  Ana Pérez ";
  input(page, "correo").value = " Ana@Example.com ";
  input(page, "marketing-consent").checked = true;
};

const submitForm = (page: FakePage) => {
  const form = page.document.querySelector("form");
  if (form === null) throw new Error("No form");
  page.submit(form);
};

Deno.test("a missing or malformed event code never queries the catalog", async (t) => {
  await t.step("missing", async () => {
    const { page, catalogCalls } = await start({ search: "" });
    assertEquals(heading(page), "Falta el evento");
    assertEquals(catalogCalls, []);
  });
  await t.step("malformed", async () => {
    const { page, catalogCalls } = await start({ search: "?evento=ab" });
    assertEquals(heading(page), "No encontramos este evento");
    assertEquals(catalogCalls, []);
  });
});

Deno.test("catalog outcomes select the page state", async (t) => {
  await t.step("not found", async () => {
    const { page, catalogCalls } = await start({
      catalog: () => Promise.resolve(null),
    });
    assertEquals(catalogCalls, ["webinar-scan-a"]);
    assertEquals(heading(page), "No encontramos este evento");
  });
  await t.step("unavailable", async () => {
    const { page } = await start({
      catalog: () => Promise.reject(new Error("down")),
    });
    assertEquals(heading(page), "No pudimos cargar el evento");
  });
  await t.step("closed", async () => {
    const { page, challengeSlots } = await start({
      catalog: () =>
        Promise.resolve({ ...OPEN_EVENT, registrationOpensAt: null }),
    });
    assertEquals(heading(page), "Webinar de ultrasonido");
    assertEquals(page.document.querySelector("form"), null);
    assertEquals(challengeSlots, []);
  });
  await t.step("open", async () => {
    const { page, challengeSlots } = await start();
    assertEquals(heading(page), "Webinar de ultrasonido");
    assertEquals(challengeSlots, [byId(page.document, "verificacion")]);
  });
});

Deno.test("a valid submission registers once with normalized values and shows the success", async () => {
  const { page, registrations, resets } = await start();
  fillForm(page);
  submitForm(page);
  await settle();

  assertEquals(registrations, [{
    eventCode: "webinar-scan-a",
    name: "Ana Pérez",
    email: "ana@example.com",
    marketingConsent: true,
    challengeToken: "token-1",
  }]);
  assertEquals(resets(), 1);
  const success = page.document.querySelector("#inscripcion-contenido h2");
  assertEquals(text(success), "Tu inscripción quedó registrada.");
  assertEquals(page.focused(), success);
});

Deno.test("inspector submission validates the ficha and registers with its photo", async () => {
  const { page, registrations, resets } = await start({ inspector: true });
  input(page, "correo").value = " Ana@Example.com ";
  input(page, "marketing-consent").checked = true;
  input(page, "nombres").value = " Ana ";
  input(page, "apellidos").value = " Pérez ";
  input(page, "documento").value = " abc12345 ";
  input(page, "pais").value = " Ecuador ";
  input(page, "experiencia-anios").value = "8";
  input(page, "empleador-declarado").value = " Empresa ";
  input(page, "consentimiento-datos").checked = true;
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", {
    type: "image/jpeg",
  });
  Object.defineProperty(input(page, "foto"), "files", { value: [photo] });
  submitForm(page);
  await settle();

  assertEquals(registrations, [{
    eventCode: "webinar-scan-a",
    name: "",
    email: "ana@example.com",
    marketingConsent: true,
    challengeToken: "token-1",
    inspectorProfile: {
      nombres: "Ana",
      apellidos: "Pérez",
      documento: "ABC12345",
      pais: "Ecuador",
      experienciaAnios: 8,
      empleadorDeclarado: "Empresa",
      sinEmpleador: false,
      consentimientoDatos: true,
      foto: photo,
    },
  }]);
  assertEquals(resets(), 1);
  assertEquals(
    text(page.document.querySelector("#inscripcion-contenido h2")),
    "Tu inscripción quedó registrada.",
  );
});

Deno.test("inspector ficha errors focus the first invalid field and do not submit", async () => {
  const { page, registrations } = await start({ inspector: true });
  input(page, "correo").value = "ana@example.com";
  submitForm(page);
  await settle();
  assertEquals(registrations, []);
  assertEquals(
    text(byId(page.document, "nombres-error")),
    "Escribe entre 2 y 60 caracteres para tus nombres.",
  );
  assertEquals(
    text(byId(page.document, "documento-error")),
    "Escribe tu documento.",
  );
  assertEquals(page.focused(), input(page, "nombres"));
});

Deno.test("a second submit while the first is pending is ignored", async () => {
  const pending = deferred<RegistrationResult>();
  const { page, registrations } = await start({
    register: () => pending.promise,
  });
  fillForm(page);
  submitForm(page);
  await settle();
  submitForm(page);
  submitForm(page);
  await settle();
  assertEquals(registrations.length, 1);
  const submit = byId(page.document, "inscripcion-enviar");
  assertEquals(submit.hasAttribute("disabled"), true);
  assertEquals(
    page.document.querySelector("form")?.getAttribute("aria-busy"),
    "true",
  );

  pending.resolve({ ok: true });
  await settle();
  assertEquals(registrations.length, 1);
  assertEquals(
    text(page.document.querySelector("#inscripcion-contenido h2")),
    "Tu inscripción quedó registrada.",
  );
});

Deno.test("invalid fields block the request and focus the first invalid field", async () => {
  const { page, registrations } = await start();
  input(page, "correo").value = "ana@example";
  submitForm(page);
  await settle();
  assertEquals(registrations, []);
  assertEquals(text(byId(page.document, "nombre-error")), "Escribe tu nombre.");
  assertEquals(
    text(byId(page.document, "correo-error")),
    "Escribe un correo válido, por ejemplo nombre@empresa.com.",
  );
  assertEquals(page.focused(), input(page, "nombre"));
});

Deno.test("without a challenge token the request is not sent", async () => {
  const { page, registrations, setToken } = await start();
  setToken(null);
  fillForm(page);
  submitForm(page);
  await settle();
  assertEquals(registrations, []);
  assertEquals(
    text(byId(page.document, "verificacion-error")),
    "Completa la verificación de seguridad antes de enviar.",
  );
  assertEquals(page.focused(), byId(page.document, "verificacion"));
});

Deno.test("when the challenge cannot load, the form explains it and sends nothing", async () => {
  const { page, registrations } = await start({
    challenge: () => Promise.reject(new Error("blocked")),
  });
  fillForm(page);
  submitForm(page);
  await settle();
  assertEquals(registrations, []);
  assertEquals(
    text(byId(page.document, "verificacion-error")),
    "No pudimos cargar la verificación de seguridad. Recarga la página para intentarlo de nuevo.",
  );
});

Deno.test("API errors are shown next to the field they concern and the form stays usable", async () => {
  const { page, registrations, resets } = await start({
    register: () =>
      Promise.resolve({
        ok: false,
        error: "ALREADY_REGISTERED",
        retryAfterSeconds: null,
      }),
  });
  fillForm(page);
  submitForm(page);
  await settle();
  assertEquals(registrations.length, 1);
  assertEquals(resets(), 1);
  assertEquals(
    text(byId(page.document, "correo-error")),
    "Este correo ya está inscrito en este evento.",
  );
  assertEquals(input(page, "correo").getAttribute("aria-invalid"), "true");
  assertEquals(page.focused(), input(page, "correo"));
  assertEquals(
    byId(page.document, "inscripcion-enviar").hasAttribute("disabled"),
    false,
  );
});

Deno.test("a rate-limited submission shows the wait in the status region", async () => {
  const { page } = await start({
    register: () =>
      Promise.resolve({
        ok: false,
        error: "RATE_LIMITED",
        retryAfterSeconds: 120,
      }),
  });
  fillForm(page);
  submitForm(page);
  await settle();
  assertEquals(
    text(byId(page.document, "inscripcion-estado")),
    "Demasiados intentos Espera 2 minutos antes de volver a intentarlo.",
  );
});

Deno.test("an unexpected failure of the client still ends the submission", async () => {
  const { page } = await start({
    register: () => Promise.reject(new Error("bug")),
  });
  fillForm(page);
  submitForm(page);
  await settle();
  assertEquals(
    text(byId(page.document, "inscripcion-estado")),
    "No pudimos registrar tu inscripción Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.",
  );
  assertEquals(
    byId(page.document, "inscripcion-enviar").hasAttribute("disabled"),
    false,
  );
});

Deno.test("leaving the email field shows the address as it will be stored", async () => {
  const { page } = await start();
  const email = input(page, "correo");
  email.value = "  Ana@Example.COM ";
  page.blur(email);
  assertEquals(email.value, "ana@example.com");
});
