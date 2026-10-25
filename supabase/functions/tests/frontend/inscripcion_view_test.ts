/// <reference lib="dom" />
import { assertEquals } from "../dev_deps.ts";
import type { PublicEvent } from "../../../../public/js/core/api.js";
import {
  clearFeedback,
  readRegistrationForm,
  renderCatalogUnavailable,
  renderClosedEvent,
  renderEventNotFound,
  renderMissingEvent,
  renderOpenEvent,
  renderSuccess,
  setSubmitting,
  showEmailValue,
  showFieldErrors,
  showStatus,
} from "../../../../public/js/inscripcion/view.js";
import { byId, loadRegistrationPage } from "./fake_dom.ts";

const EVENT: PublicEvent = {
  code: "webinar-scan-a",
  title: "Webinar de ultrasonido",
  type: "webinar",
  summary: "Un párrafo sobre el webinar.",
  dateText: "5 de noviembre de 2026",
  date: "2026-11-05",
  duration: "2 horas",
  registrationOpensAt: new Date("2026-10-01T00:00:00Z"),
  registrationClosesAt: null,
  requiresInspectorProfile: false,
};

const CONSENT_TEXT =
  "Quiero recibir información sobre futuros talleres y actividades de ECCIA. Esta opción es voluntaria.";

const text = (element: Element | null): string =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

const content = (document: Document) => byId(document, "inscripcion-contenido");
const title = (document: Document) => byId(document, "inscripcion-titulo");

Deno.test("the page markup loads brand tokens first and the page as a module", async () => {
  const { document } = await loadRegistrationPage();
  const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => link.getAttribute("href"))
    .filter((href) => href !== null && !href.startsWith("https://"));
  assertEquals(stylesheets, [
    "brand/tokens.css",
    "brand/components.css",
    "styles.css",
  ]);
  const scripts = [...document.querySelectorAll("script")].map((script) => ({
    type: script.getAttribute("type"),
    src: script.getAttribute("src"),
    inline: text(script),
  }));
  assertEquals(scripts, [{
    type: "module",
    src: "js/inscripcion/main.js",
    inline: "",
  }]);
  assertEquals(byId(document, "contenido-principal").tagName, "MAIN");
  assertEquals(
    document.querySelector(".skip-link")?.getAttribute("href"),
    "#contenido-principal",
  );
});

Deno.test("missing, unknown and unavailable events show a message without a form", async (t) => {
  const cases: [string, (document: Document) => void, string, string][] = [
    [
      "missing",
      renderMissingEvent,
      "Falta el evento",
      "El enlace no indica a qué evento quieres inscribirte. Revisa que el enlace esté completo o vuelve a abrirlo desde la invitación.",
    ],
    [
      "not found",
      renderEventNotFound,
      "No encontramos este evento",
      "El enlace no corresponde a un evento disponible. Revisa que el enlace esté completo o vuelve a abrirlo desde la invitación.",
    ],
    [
      "unavailable",
      renderCatalogUnavailable,
      "No pudimos cargar el evento",
      "Ocurrió un problema al consultar la información. Recarga la página en unos minutos.",
    ],
  ];
  for (const [name, render, expectedTitle, expectedMessage] of cases) {
    await t.step(name, async () => {
      const { document } = await loadRegistrationPage();
      render(document);
      assertEquals(text(title(document)), expectedTitle);
      assertEquals(text(content(document)), expectedMessage);
      assertEquals(document.querySelector("form"), null);
    });
  }
});

Deno.test("a closed event shows its details and the closed notice without a form", async () => {
  const { document } = await loadRegistrationPage();
  renderClosedEvent(document, EVENT);

  assertEquals(text(title(document)), "Webinar de ultrasonido");
  assertEquals(document.title, "Webinar de ultrasonido | Inscripción ECCIA");
  assertEquals(
    text(document.querySelector("#inscripcion-evento .section-eyebrow")),
    "Webinar",
  );
  assertEquals(
    text(document.querySelector(".inscripcion-resumen")),
    "Un párrafo sobre el webinar.",
  );
  assertEquals(
    [...document.querySelectorAll(".inscripcion-datos dt")].map(text),
    ["Fecha", "Duración"],
  );
  assertEquals(
    document.querySelector(".inscripcion-datos time")?.getAttribute(
      "datetime",
    ),
    "2026-11-05",
  );
  assertEquals(
    [...document.querySelectorAll(".inscripcion-datos dd")].map(text),
    ["5 de noviembre de 2026", "2 horas"],
  );
  assertEquals(
    text(content(document)),
    "Inscripciones cerradas Las inscripciones para este evento no están abiertas en este momento.",
  );
  assertEquals(document.querySelector("form"), null);
});

Deno.test("optional event fields are omitted, and the type label follows the event", async () => {
  const { document } = await loadRegistrationPage();
  renderClosedEvent(document, {
    ...EVENT,
    type: null,
    summary: null,
    dateText: null,
    duration: null,
  });
  assertEquals(
    text(document.querySelector("#inscripcion-evento .section-eyebrow")),
    "Inscripción",
  );
  assertEquals(document.querySelector(".inscripcion-resumen"), null);
  assertEquals(document.querySelector(".inscripcion-datos"), null);

  renderClosedEvent(document, { ...EVENT, type: "curso" });
  assertEquals(
    text(document.querySelector("#inscripcion-evento .section-eyebrow")),
    "Curso",
  );
});

Deno.test("event data is inserted as text, never as markup", async () => {
  const { document } = await loadRegistrationPage();
  const payload = '<img src=x onerror="alert(1)">';
  renderOpenEvent(document, {
    ...EVENT,
    title: payload,
    summary: payload,
    dateText: payload,
    duration: payload,
  });
  assertEquals(title(document).textContent, payload);
  assertEquals(
    document.querySelector(".inscripcion-resumen")?.textContent,
    payload,
  );
  assertEquals(document.querySelector("img[onerror]"), null);
  assertEquals(document.title, `${payload} | Inscripción ECCIA`);
});

Deno.test("an open event renders a labelled, described and keyboard-reachable form", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, EVENT);

  assertEquals(text(title(document)), "Webinar de ultrasonido");
  const form = document.querySelector("form");
  assertEquals(form, refs.form);
  assertEquals(form?.hasAttribute("novalidate"), true);

  const label = (id: string) =>
    text(document.querySelector(`label[for="${id}"]`));
  assertEquals(label("nombre"), "Nombre *");
  assertEquals(label("correo"), "Correo electrónico *");
  assertEquals(label("marketing-consent"), CONSENT_TEXT);

  assertEquals(refs.name.getAttribute("autocomplete"), "name");
  assertEquals(refs.name.hasAttribute("required"), true);
  assertEquals(refs.email.getAttribute("type"), "email");
  assertEquals(refs.email.getAttribute("autocomplete"), "email");
  assertEquals(refs.email.hasAttribute("required"), true);
  assertEquals(refs.consent.getAttribute("type"), "checkbox");
  assertEquals(refs.consent.hasAttribute("required"), false);

  for (const control of [refs.name, refs.email, refs.challengeSlot]) {
    const described = (control.getAttribute("aria-describedby") ?? "")
      .split(" ").filter((id) => id.length > 0);
    assertEquals(
      described.every((id) => document.getElementById(id) !== null),
      true,
      `${control.id} describes only existing elements`,
    );
    const errorId = described.find((id) => id.endsWith("-error"));
    const error = errorId === undefined
      ? null
      : document.getElementById(errorId);
    assertEquals(error?.hasAttribute("hidden"), true, `${control.id} error`);
  }
  assertEquals(refs.challengeSlot.getAttribute("role"), "group");
  assertEquals(
    text(
      document.getElementById(
        refs.challengeSlot.getAttribute("aria-labelledby") ?? "",
      ),
    ),
    "Verificación de seguridad",
  );
  assertEquals(refs.submit.getAttribute("type"), "submit");
  assertEquals(text(refs.submit), "Inscribirse");
  assertEquals(refs.status.getAttribute("role"), "status");
  assertEquals(text(refs.status), "");
});

Deno.test("inspector events render the accessible required ficha without a generic name", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, {
    ...EVENT,
    requiresInspectorProfile: true,
  });
  const label = (id: string) =>
    text(document.querySelector(`label[for="${id}"]`));
  for (
    const [id, expected] of [
      ["nombres", "Nombres *"],
      ["apellidos", "Apellidos *"],
      ["documento", "Número de documento de identidad *"],
      ["pais", "País *"],
      ["experiencia-anios", "Años de experiencia *"],
      ["foto", "Foto *"],
    ]
  ) {
    assertEquals(label(id), expected);
    assertEquals(document.getElementById(id)?.hasAttribute("required"), true);
  }
  assertEquals(label("empleador-declarado"), "Empleador declarado");
  assertEquals(
    document.getElementById("empleador-declarado")?.hasAttribute("required"),
    false,
  );
  assertEquals(document.getElementById("nombre"), null);
  assertEquals(refs.inspectorFields !== null, true);
  assertEquals(
    text(document.querySelector('label[for="consentimiento-datos"]')),
    "Autorizo a ECCIA (Littus Group America) a tratar mis datos personales y mi foto para gestionar mi inscripción y mi certificación. *",
  );
  assertEquals(
    (document.getElementById("foto") as HTMLInputElement).getAttribute(
      "accept",
    ),
    "image/jpeg,image/png",
  );
  assertEquals(
    document.getElementById("sin-empleador")?.getAttribute("type"),
    "checkbox",
  );
  assertEquals(
    refs.inspectorFields?.sinEmpleador.hasAttribute("required"),
    false,
  );
  assertEquals(
    refs.inspectorFields?.consentimientoDatos.hasAttribute("required"),
    true,
  );
  for (
    const id of [
      "nombres",
      "apellidos",
      "documento",
      "pais",
      "experiencia-anios",
      "empleador-declarado",
      "foto",
      "consentimiento-datos",
    ]
  ) {
    const control = document.getElementById(id);
    const described = (control?.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter((value) => value.length > 0);
    assertEquals(
      described.length > 0 &&
        described.every((descriptionId) =>
          document.getElementById(descriptionId) !== null
        ),
      true,
      `${id} has existing help and error descriptions`,
    );
    assertEquals(
      document.getElementById(`${id}-error`)?.hasAttribute("hidden"),
      true,
    );
  }
});

Deno.test("non-inspector events do not render or require inspector fields", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, EVENT);
  assertEquals(document.getElementById("foto"), null);
  assertEquals(refs.inspectorFields, null);
  assertEquals(refs.name.hasAttribute("required"), true);
});

Deno.test("form values are read as typed and the stored email is shown back", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, EVENT);
  refs.name.value = " Ana ";
  refs.email.value = " Ana@Example.com ";
  assertEquals(readRegistrationForm(refs), {
    name: " Ana ",
    email: " Ana@Example.com ",
    marketingConsent: false,
  });
  refs.consent.checked = true;
  assertEquals(readRegistrationForm(refs).marketingConsent, true);
  showEmailValue(refs, "ana@example.com");
  assertEquals(refs.email.value, "ana@example.com");
});

Deno.test("field errors are announced next to each field and focus the first invalid one", async () => {
  const page = await loadRegistrationPage();
  const refs = renderOpenEvent(page.document, EVENT);

  showFieldErrors(refs, {
    email: "Correo inválido.",
    name: "Nombre inválido.",
  });
  const nameError = byId(page.document, "nombre-error");
  const emailError = byId(page.document, "correo-error");
  assertEquals([text(nameError), nameError.hasAttribute("hidden")], [
    "Nombre inválido.",
    false,
  ]);
  assertEquals([text(emailError), emailError.hasAttribute("hidden")], [
    "Correo inválido.",
    false,
  ]);
  assertEquals(refs.name.getAttribute("aria-invalid"), "true");
  assertEquals(refs.email.getAttribute("aria-invalid"), "true");
  assertEquals(page.focused(), refs.name);

  clearFeedback(refs);
  assertEquals(nameError.hasAttribute("hidden"), true);
  assertEquals(text(nameError), "");
  assertEquals(refs.name.hasAttribute("aria-invalid"), false);
  assertEquals(refs.email.hasAttribute("aria-invalid"), false);

  showFieldErrors(refs, { challenge: "Completa la verificación." });
  const challengeError = byId(page.document, "verificacion-error");
  assertEquals(text(challengeError), "Completa la verificación.");
  assertEquals(challengeError.hasAttribute("hidden"), false);
  assertEquals(page.focused(), refs.challengeSlot);
  assertEquals(refs.challengeSlot.getAttribute("tabindex"), "-1");
});

Deno.test("the status region shows a titled message built from text", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, EVENT);
  showStatus(refs, { title: "Título <b>", message: "Mensaje <i>" });
  assertEquals(text(refs.status.querySelector("strong")), "Título <b>");
  assertEquals(text(refs.status.querySelector("span")), "Mensaje <i>");
  assertEquals(refs.status.querySelector("b, i"), null);
  assertEquals(
    refs.status.querySelector(".form-status")?.getAttribute("data-state"),
    "error",
  );
  clearFeedback(refs);
  assertEquals(text(refs.status), "");
});

Deno.test("while submitting, the button is disabled and the form is busy", async () => {
  const { document } = await loadRegistrationPage();
  const refs = renderOpenEvent(document, EVENT);
  setSubmitting(refs, true);
  assertEquals(refs.submit.hasAttribute("disabled"), true);
  assertEquals(refs.form.getAttribute("aria-busy"), "true");
  assertEquals(text(refs.submit), "Enviando…");
  setSubmitting(refs, false);
  assertEquals(refs.submit.hasAttribute("disabled"), false);
  assertEquals(refs.form.getAttribute("aria-busy"), "false");
  assertEquals(text(refs.submit), "Inscribirse");
});

Deno.test("success replaces the form and moves focus to its heading", async () => {
  const page = await loadRegistrationPage();
  renderOpenEvent(page.document, EVENT);
  renderSuccess(page.document);

  assertEquals(page.document.querySelector("form"), null);
  const heading = page.document.querySelector("#inscripcion-contenido h2");
  assertEquals(text(heading), "Tu inscripción quedó registrada.");
  assertEquals(heading?.getAttribute("tabindex"), "-1");
  assertEquals(page.focused(), heading);
  assertEquals(text(title(page.document)), "Webinar de ultrasonido");
  assertEquals(/correo/i.test(text(content(page.document))), false);
});
