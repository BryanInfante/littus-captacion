// @ts-check
/// <reference lib="dom" />

// Presentational half of the registration page: functions that receive data
// and the document and render it. No state, no network. Event content is
// always inserted with textContent, never parsed as markup.

/** @typedef {import("../core/api.js").PublicEvent} PublicEvent */
/** @typedef {import("./model.js").FieldErrors} FieldErrors */
/** @typedef {import("./model.js").RegistrationInput} RegistrationInput */

/**
 * The form controls the container wires and reads.
 *
 * @typedef {object} FormRefs
 * @property {HTMLFormElement} form
 * @property {HTMLInputElement} name
 * @property {HTMLInputElement} email
 * @property {HTMLInputElement} consent
 * @property {HTMLElement} challengeSlot
 * @property {HTMLButtonElement} submit
 * @property {HTMLElement} status
 */

const TYPE_LABEL = { webinar: "Webinar", curso: "Curso" };
const DEFAULT_EYEBROW = "Inscripción";
const SUBMIT_LABEL = "Inscribirse";
const SUBMITTING_LABEL = "Enviando…";
// Verbatim from the landing form (public/index.html).
const CONSENT_TEXT =
  "Quiero recibir información sobre futuros talleres y actividades de ECCIA. Esta opción es voluntaria.";

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} document
 * @param {K} tag
 * @param {{ className?: string, id?: string, text?: string, attributes?: Record<string, string> }} [options]
 * @returns {HTMLElementTagNameMap[K]}
 */
const create = (document, tag, options = {}) => {
  const element = document.createElement(tag);
  if (options.className !== undefined) element.className = options.className;
  if (options.id !== undefined) element.id = options.id;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
};

/**
 * @param {Document} document
 * @param {string} id
 * @returns {HTMLElement}
 */
const required = (document, id) => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element;
};

/**
 * @param {Document} document
 * @param {string} eyebrow
 * @param {string} title
 * @param {Node[]} details
 */
const renderHeader = (document, eyebrow, title, details) => {
  required(document, "inscripcion-evento").replaceChildren(
    create(document, "p", { className: "section-eyebrow", text: eyebrow }),
    create(document, "h1", { id: "inscripcion-titulo", text: title }),
    ...details,
  );
};

/**
 * @param {Document} document
 * @param {Node[]} children
 */
const renderContent = (document, children) => {
  required(document, "inscripcion-contenido").replaceChildren(...children);
};

/**
 * @param {Document} document
 * @param {string} title
 * @param {string} message
 */
const renderNotice = (document, title, message) => {
  renderHeader(document, DEFAULT_EYEBROW, title, []);
  renderContent(document, [
    create(document, "p", { className: "inscripcion-aviso", text: message }),
  ]);
};

/** @param {Document} document */
export const renderMissingEvent = (document) =>
  renderNotice(
    document,
    "Falta el evento",
    "El enlace no indica a qué evento quieres inscribirte. Revisa que el enlace esté completo o vuelve a abrirlo desde la invitación.",
  );

/** @param {Document} document */
export const renderEventNotFound = (document) =>
  renderNotice(
    document,
    "No encontramos este evento",
    "El enlace no corresponde a un evento disponible. Revisa que el enlace esté completo o vuelve a abrirlo desde la invitación.",
  );

/** @param {Document} document */
export const renderCatalogUnavailable = (document) =>
  renderNotice(
    document,
    "No pudimos cargar el evento",
    "Ocurrió un problema al consultar la información. Recarga la página en unos minutos.",
  );

/**
 * @param {Document} document
 * @param {PublicEvent} event
 */
const renderEventDetails = (document, event) => {
  /** @type {Node[]} */
  const details = [];
  if (event.summary !== null) {
    details.push(
      create(document, "p", {
        className: "inscripcion-resumen",
        text: event.summary,
      }),
    );
  }
  /** @type {[string, Node][]} */
  const facts = [];
  if (event.dateText !== null) {
    const when = event.date === null
      ? create(document, "span", { text: event.dateText })
      : create(document, "time", {
        text: event.dateText,
        attributes: { datetime: event.date },
      });
    facts.push(["Fecha", when]);
  }
  if (event.duration !== null) {
    facts.push(["Duración", document.createTextNode(event.duration)]);
  }
  if (facts.length > 0) {
    const list = create(document, "dl", { className: "inscripcion-datos" });
    for (const [term, value] of facts) {
      const row = create(document, "div");
      const definition = create(document, "dd");
      definition.append(value);
      row.append(create(document, "dt", { text: term }), definition);
      list.append(row);
    }
    details.push(list);
  }
  renderHeader(
    document,
    event.type === null ? DEFAULT_EYEBROW : TYPE_LABEL[event.type],
    event.title,
    details,
  );
  document.title = `${event.title} | Inscripción ECCIA`;
};

/**
 * @param {Document} document
 * @param {PublicEvent} event
 */
export const renderClosedEvent = (document, event) => {
  renderEventDetails(document, event);
  const notice = create(document, "div", { className: "inscripcion-aviso" });
  notice.append(
    create(document, "strong", { text: "Inscripciones cerradas" }),
    " ",
    create(document, "span", {
      text:
        "Las inscripciones para este evento no están abiertas en este momento.",
    }),
  );
  renderContent(document, [notice]);
};

/**
 * A label with the required mark, as on the landing form.
 *
 * @param {Document} document
 * @param {string} forId
 * @param {string} text
 */
const requiredLabel = (document, forId, text) => {
  const label = create(document, "label", { attributes: { for: forId } });
  label.append(
    `${text} `,
    create(document, "span", {
      className: "required-mark",
      text: "*",
      attributes: { "aria-hidden": "true" },
    }),
  );
  return label;
};

/**
 * @param {Document} document
 * @param {string} id
 */
const fieldError = (document, id) => {
  const error = create(document, "p", { className: "field-error", id });
  error.hidden = true;
  return error;
};

/**
 * @param {Document} document
 * @param {{ id: string, label: string, help: string, attributes: Record<string, string> }} field
 */
const textField = (document, field) => {
  const wrapper = create(document, "div", { className: "field" });
  const input = create(document, "input", {
    className: "input",
    id: field.id,
    attributes: {
      name: field.id,
      required: "",
      "aria-describedby": `${field.id}-help ${field.id}-error`,
      ...field.attributes,
    },
  });
  wrapper.append(
    requiredLabel(document, field.id, field.label),
    input,
    create(document, "p", {
      className: "field-help",
      id: `${field.id}-help`,
      text: field.help,
    }),
    fieldError(document, `${field.id}-error`),
  );
  return { wrapper, input };
};

/**
 * Renders the event and its registration form.
 *
 * @param {Document} document
 * @param {PublicEvent} event
 * @returns {FormRefs}
 */
export const renderOpenEvent = (document, event) => {
  renderEventDetails(document, event);

  const form = create(document, "form", {
    id: "inscripcion-formulario",
    attributes: { novalidate: "", "aria-busy": "false" },
  });

  const note = create(document, "p", { className: "inscripcion-nota" });
  note.append(
    "Los campos marcados con ",
    create(document, "span", {
      className: "required-mark",
      text: "*",
      attributes: { "aria-hidden": "true" },
    }),
    create(document, "span", {
      className: "visually-hidden",
      text: "un asterisco",
    }),
    " son obligatorios.",
  );

  const name = textField(document, {
    id: "nombre",
    label: "Nombre",
    help: "Campo obligatorio.",
    attributes: { type: "text", autocomplete: "name" },
  });
  const email = textField(document, {
    id: "correo",
    label: "Correo electrónico",
    help: "Campo obligatorio. Se guarda en minúsculas y sin espacios.",
    attributes: {
      type: "email",
      autocomplete: "email",
      inputmode: "email",
      autocapitalize: "none",
      spellcheck: "false",
    },
  });

  const consentLabel = create(document, "label", {
    className: "consent-field",
    attributes: { for: "marketing-consent" },
  });
  const consent = create(document, "input", {
    id: "marketing-consent",
    attributes: { name: "marketing_consent", type: "checkbox" },
  });
  consentLabel.append(
    consent,
    create(document, "span", { text: CONSENT_TEXT }),
  );

  const challenge = create(document, "div", { className: "field" });
  const challengeSlot = create(document, "div", {
    className: "challenge-slot",
    id: "verificacion",
    attributes: {
      role: "group",
      "aria-labelledby": "verificacion-label",
      "aria-describedby": "verificacion-error",
    },
  });
  challenge.append(
    create(document, "p", {
      className: "field-label",
      id: "verificacion-label",
      text: "Verificación de seguridad",
    }),
    challengeSlot,
    fieldError(document, "verificacion-error"),
  );

  const submit = create(document, "button", {
    className: "btn-primary submit-button",
    id: "inscripcion-enviar",
    text: SUBMIT_LABEL,
    attributes: { type: "submit" },
  });
  // The live region stays in the document; only its content changes, so
  // screen readers announce each new message.
  const status = create(document, "div", {
    id: "inscripcion-estado",
    attributes: { role: "status" },
  });

  form.append(
    note,
    name.wrapper,
    email.wrapper,
    consentLabel,
    challenge,
    submit,
    status,
  );
  renderContent(document, [form]);

  return {
    form,
    name: name.input,
    email: email.input,
    consent,
    challengeSlot,
    submit,
    status,
  };
};

/**
 * @param {FormRefs} refs
 * @returns {RegistrationInput}
 */
export const readRegistrationForm = (refs) => ({
  name: refs.name.value,
  email: refs.email.value,
  marketingConsent: refs.consent.checked === true,
});

/**
 * @param {FormRefs} refs
 * @param {string} email
 */
export const showEmailValue = (refs, email) => {
  refs.email.value = email;
};

/**
 * @param {FormRefs} refs
 * @returns {[keyof FieldErrors, HTMLElement, HTMLElement][]} In focus order.
 */
const fieldsOf = (refs) => {
  const document = refs.form.ownerDocument;
  return [
    ["name", refs.name, required(document, "nombre-error")],
    ["email", refs.email, required(document, "correo-error")],
    ["challenge", refs.challengeSlot, required(document, "verificacion-error")],
  ];
};

/** @param {FormRefs} refs */
export const clearFeedback = (refs) => {
  for (const [, control, error] of fieldsOf(refs)) {
    control.removeAttribute("aria-invalid");
    error.textContent = "";
    error.hidden = true;
  }
  refs.status.replaceChildren();
};

/**
 * Shows each message next to its field and focuses the first invalid one.
 *
 * @param {FormRefs} refs
 * @param {FieldErrors} errors
 */
export const showFieldErrors = (refs, errors) => {
  /** @type {HTMLElement | null} */
  let first = null;
  for (const [field, control, error] of fieldsOf(refs)) {
    const message = errors[field];
    if (message === undefined) continue;
    error.textContent = message;
    error.hidden = false;
    if (field === "challenge") {
      // The widget lives in an iframe; the group itself takes the focus.
      control.tabIndex = -1;
    } else {
      control.setAttribute("aria-invalid", "true");
    }
    first ??= control;
  }
  first?.focus();
};

/**
 * @param {FormRefs} refs
 * @param {{ title: string, message: string }} message
 */
export const showStatus = (refs, message) => {
  const document = refs.form.ownerDocument;
  const box = create(document, "div", {
    className: "form-status",
    attributes: { "data-state": "error" },
  });
  box.append(
    create(document, "strong", { text: message.title }),
    // Keeps title and message as two phrases for assistive technology.
    " ",
    create(document, "span", { text: message.message }),
  );
  refs.status.replaceChildren(box);
};

/**
 * @param {FormRefs} refs
 * @param {boolean} submitting
 */
export const setSubmitting = (refs, submitting) => {
  refs.submit.toggleAttribute("disabled", submitting);
  refs.submit.textContent = submitting ? SUBMITTING_LABEL : SUBMIT_LABEL;
  refs.form.setAttribute("aria-busy", submitting ? "true" : "false");
};

/**
 * Replaces the form with the confirmation and moves focus to it. The page
 * promises no email: the confirmation message is delivered by a later step.
 *
 * @param {Document} document
 */
export const renderSuccess = (document) => {
  const box = create(document, "div", {
    className: "form-status inscripcion-exito",
  });
  const heading = create(document, "h2", {
    id: "inscripcion-exito-titulo",
    text: "Tu inscripción quedó registrada.",
  });
  heading.tabIndex = -1;
  box.append(heading);
  renderContent(document, [box]);
  heading.focus();
};
