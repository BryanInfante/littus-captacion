// @ts-check

// Pure decisions of the registration page: no DOM, no network, no clock. The
// rules mirror the backend (supabase/functions/_shared/domain/) so the page
// never sends a request the API is certain to reject; tests compare both
// sides case by case to keep them from drifting. The API stays the authority.

/** @typedef {import("../core/api.js").PublicEvent} PublicEvent */
/** @typedef {import("../core/api.js").RegistrationResult} RegistrationResult */

/**
 * @typedef {{ kind: "missing" } | { kind: "invalid" } | { kind: "code", code: string }} EventSlug
 */

/**
 * @typedef {{ kind: "not-found" }
 *   | { kind: "closed", event: PublicEvent }
 *   | { kind: "open", event: PublicEvent }
 * } PageState
 */

/**
 * @typedef {object} RegistrationInput
 * @property {string} name
 * @property {string} email
 * @property {boolean} marketingConsent
 */

/** @typedef {{ name?: string, email?: string, challenge?: string }} FieldErrors */

/**
 * @typedef {{ ok: true, values: RegistrationInput } | { ok: false, errors: FieldErrors }} Validation
 */

/**
 * Where an API error is shown: next to a field, or in the form's status.
 *
 * @typedef {{ target: "name" | "email" | "challenge", message: string }
 *   | { target: "status", title: string, message: string }
 * } Feedback
 */

// Same bounds as parseEventCode, parseRegistrationName and Email.parse.
const EVENT_CODE_LENGTH = { min: 3, max: 80 };
const NAME_LENGTH = { min: 2, max: 120 };
const EMAIL_LENGTH = { min: 6, max: 254 };
const EMAIL_FORMAT = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export const CHALLENGE_REQUIRED =
  "Completa la verificación de seguridad antes de enviar.";
export const CHALLENGE_UNAVAILABLE =
  "No pudimos cargar la verificación de seguridad. Recarga la página para intentarlo de nuevo.";

/**
 * PostgreSQL char_length, and so the backend, counts code points.
 *
 * @param {string} value
 */
const codePoints = (value) => [...value].length;

/**
 * @param {string} search The page's `location.search`.
 * @returns {EventSlug}
 */
export const parseEventSlug = (search) => {
  const code = new URLSearchParams(search).get("evento")?.trim() ?? "";
  if (code.length === 0) return { kind: "missing" };
  const length = codePoints(code);
  return length < EVENT_CODE_LENGTH.min || length > EVENT_CODE_LENGTH.max
    ? { kind: "invalid" }
    : { kind: "code", code };
};

/**
 * The domain's acceptsRegistrations for an event the catalog lists, which is
 * always active: the opening is set and reached, and the closing, if any, is
 * still ahead.
 *
 * @param {Pick<PublicEvent, "registrationOpensAt" | "registrationClosesAt">} event
 * @param {Date} now
 */
export const isRegistrationOpen = (event, now) =>
  event.registrationOpensAt !== null &&
  event.registrationOpensAt.getTime() <= now.getTime() &&
  (event.registrationClosesAt === null ||
    now.getTime() < event.registrationClosesAt.getTime());

/**
 * @param {PublicEvent | null} event
 * @param {Date} now
 * @returns {PageState}
 */
export const pageStateFor = (event, now) => {
  if (event === null) return { kind: "not-found" };
  return isRegistrationOpen(event, now)
    ? { kind: "open", event }
    : { kind: "closed", event };
};

/** @param {string} value */
export const normalizeEmail = (value) => value.trim().toLowerCase();

/**
 * @param {string} name Already trimmed.
 * @returns {string | undefined}
 */
const nameError = (name) => {
  if (name.length === 0) return "Escribe tu nombre.";
  const length = codePoints(name);
  if (length < NAME_LENGTH.min) {
    return "El nombre debe tener al menos 2 caracteres.";
  }
  if (length > NAME_LENGTH.max) {
    return "El nombre puede tener hasta 120 caracteres.";
  }
  return undefined;
};

/**
 * @param {string} email Already normalized.
 * @returns {string | undefined}
 */
const emailError = (email) => {
  if (email.length === 0) return "Escribe tu correo electrónico.";
  if (email.length > EMAIL_LENGTH.max) {
    return "El correo puede tener hasta 254 caracteres.";
  }
  if (email.length < EMAIL_LENGTH.min || !EMAIL_FORMAT.test(email)) {
    return "Escribe un correo válido, por ejemplo nombre@empresa.com.";
  }
  return undefined;
};

/**
 * @param {RegistrationInput} input The form values as typed.
 * @returns {Validation}
 */
export const validateRegistration = (input) => {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  /** @type {FieldErrors} */
  const errors = {};
  const nameProblem = nameError(name);
  if (nameProblem !== undefined) errors.name = nameProblem;
  const emailProblem = emailError(email);
  if (emailProblem !== undefined) errors.email = emailProblem;
  return Object.keys(errors).length > 0 ? { ok: false, errors } : {
    ok: true,
    values: { name, email, marketingConsent: input.marketingConsent },
  };
};

/**
 * @param {number | null} seconds
 * @returns {string}
 */
const waitMessage = (seconds) => {
  if (seconds === null) {
    return "Espera unos minutos antes de volver a intentarlo.";
  }
  if (seconds < 60) {
    return `Espera ${seconds} ${
      seconds === 1 ? "segundo" : "segundos"
    } antes de volver a intentarlo.`;
  }
  // Rounded up: retrying when the minute shown has passed must succeed.
  const minutes = Math.ceil(seconds / 60);
  return `Espera ${minutes} ${
    minutes === 1 ? "minuto" : "minutos"
  } antes de volver a intentarlo.`;
};

const RETRY_LATER = "Inténtalo de nuevo en unos minutos.";

/**
 * @param {Extract<RegistrationResult, { ok: false }>} result
 * @returns {Feedback}
 */
export const describeRegistrationError = (result) => {
  switch (result.error) {
    case "ALREADY_REGISTERED":
      return {
        target: "email",
        message: "Este correo ya está inscrito en este evento.",
      };
    case "CHALLENGE_FAILED":
      return {
        target: "challenge",
        message:
          "No pudimos confirmar la verificación de seguridad. Complétala de nuevo y vuelve a enviar.",
      };
    case "INVALID_INPUT":
      return {
        target: "status",
        title: "Revisa tus datos",
        message:
          "Algún dato no tiene el formato esperado. Corrige el nombre y el correo e inténtalo de nuevo.",
      };
    case "EVENT_NOT_FOUND":
      return {
        target: "status",
        title: "Evento no disponible",
        message: "Este evento ya no está disponible para inscripciones.",
      };
    case "REGISTRATION_CLOSED":
      return {
        target: "status",
        title: "Inscripciones cerradas",
        message: "Las inscripciones para este evento se cerraron.",
      };
    case "RATE_LIMITED":
      return {
        target: "status",
        title: "Demasiados intentos",
        message: waitMessage(result.retryAfterSeconds),
      };
    case "NETWORK_ERROR":
      return {
        target: "status",
        title: "No pudimos conectar",
        message: "Revisa tu conexión a internet e inténtalo de nuevo.",
      };
    case "INTERNAL_ERROR":
      return {
        target: "status",
        title: "No pudimos registrar tu inscripción",
        message: `Ocurrió un problema en el servidor. ${RETRY_LATER}`,
      };
    case "UNEXPECTED_RESPONSE":
      return {
        target: "status",
        title: "No pudimos registrar tu inscripción",
        message: `Ocurrió un problema inesperado. ${RETRY_LATER}`,
      };
  }
};
