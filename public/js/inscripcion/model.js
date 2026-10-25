// @ts-check

// Pure decisions of the registration page: no DOM, no network, no clock. The
// rules mirror the backend (supabase/functions/_shared/domain/) so the page
// never sends a request the API is certain to reject; tests compare both
// sides case by case to keep them from drifting. The API stays the authority.

/** @typedef {import("../core/api.js").PublicEvent} PublicEvent */
/** @typedef {import("../core/api.js").RegistrationResult} RegistrationResult */
/** @typedef {import("../core/api.js").InspectorProfileRequest} InspectorProfileRequest */

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
 * @property {{ nombres: string, apellidos: string, documento: string, pais: string,
 *   experienciaAnios: string, empleadorDeclarado: string, sinEmpleador: boolean,
 *   consentimientoDatos: boolean, foto: File | null } | undefined} [inspectorProfile]
 */

/** @typedef {{ name?: string, email?: string, challenge?: string, nombres?: string,
 *   apellidos?: string, documento?: string, pais?: string, experienciaAnios?: string,
 *   empleadorDeclarado?: string, foto?: string, consentimientoDatos?: string }} FieldErrors */

/**
 * @typedef {{ ok: true, values: ValidatedRegistrationInput }
 *   | { ok: false, errors: FieldErrors }} Validation
 */

/** @typedef {Omit<RegistrationInput, "inspectorProfile"> & { inspectorProfile?: InspectorProfileRequest }} ValidatedRegistrationInput */

/**
 * Where an API error is shown: next to a field, or in the form's status.
 *
 * @typedef {{ target: keyof FieldErrors, message: string }
 *   | { target: "status", title: string, message: string }
 * } Feedback
 */

// Same bounds as parseEventCode, parseRegistrationName and Email.parse.
const EVENT_CODE_LENGTH = { min: 3, max: 80 };
const NAME_LENGTH = { min: 2, max: 120 };
const EMAIL_LENGTH = { min: 6, max: 254 };
const EMAIL_FORMAT = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const DOCUMENT_FORMAT = /^[0-9A-Z-]{6,20}$/;
const MAX_INSPECTOR_PHOTO_BYTES = 5 * 1024 * 1024;

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
export const validateRegistration = (
  input,
  requiresInspectorProfile = false,
) => {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  /** @type {FieldErrors} */
  const errors = {};
  if (!requiresInspectorProfile) {
    const nameProblem = nameError(name);
    if (nameProblem !== undefined) errors.name = nameProblem;
  }
  const emailProblem = emailError(email);
  if (emailProblem !== undefined) errors.email = emailProblem;
  /** @type {InspectorProfileRequest | undefined} */
  let inspectorProfile;
  if (requiresInspectorProfile) {
    const profile = input.inspectorProfile;
    const nombres = profile?.nombres.trim().replace(/\s+/gu, " ") ?? "";
    const apellidos = profile?.apellidos.trim().replace(/\s+/gu, " ") ?? "";
    const documento = profile?.documento.replace(/\s+/g, "").toUpperCase() ??
      "";
    const pais = profile?.pais.trim().replace(/\s+/gu, " ") ?? "";
    const experienceText = profile?.experienciaAnios.trim() ?? "";
    const empleadorDeclarado =
      profile?.empleadorDeclarado.trim().replace(/\s+/gu, " ") ?? "";
    const foto = profile?.foto ?? null;
    if ([...nombres].length < 2 || [...nombres].length > 60) {
      errors.nombres = "Escribe entre 2 y 60 caracteres para tus nombres.";
    }
    if ([...apellidos].length < 2 || [...apellidos].length > 60) {
      errors.apellidos = "Escribe entre 2 y 60 caracteres para tus apellidos.";
    }
    const fullNameLength = [...`${apellidos} ${nombres}`.trim()].length;
    if (
      [...nombres].length >= 2 && [...apellidos].length >= 2 &&
      (fullNameLength < 5 || fullNameLength > 60)
    ) {
      errors.nombres = "El nombre completo debe tener entre 5 y 60 caracteres.";
    }
    if (documento.length === 0) errors.documento = "Escribe tu documento.";
    else if (!DOCUMENT_FORMAT.test(documento)) {
      errors.documento =
        "Usa de 6 a 20 letras, números o guiones, sin espacios.";
    }
    if ([...pais].length < 2 || [...pais].length > 60) {
      errors.pais = "Escribe un país de entre 2 y 60 caracteres.";
    }
    const experience = Number(experienceText);
    if (
      !/^\d{1,2}$/.test(experienceText) || !Number.isInteger(experience) ||
      experience < 0 || experience > 60
    ) {
      errors.experienciaAnios = "Escribe un número entero entre 0 y 60.";
    }
    if (!profile?.sinEmpleador && [...empleadorDeclarado].length < 2) {
      errors.empleadorDeclarado =
        "Escribe el empleador o selecciona que no tienes empleador.";
    } else if (!profile?.sinEmpleador && [...empleadorDeclarado].length > 120) {
      errors.empleadorDeclarado =
        "El empleador puede tener hasta 120 caracteres.";
    } else if (profile?.sinEmpleador && empleadorDeclarado.length > 0) {
      errors.empleadorDeclarado =
        "Indica el empleador o selecciona que no tienes empleador, no ambos.";
    }
    if (foto === null) errors.foto = "Selecciona una foto JPEG o PNG.";
    else if (foto.size === 0) errors.foto = "La foto no puede estar vacía.";
    else if (foto.type !== "image/jpeg" && foto.type !== "image/png") {
      errors.foto = "La foto debe estar en formato JPEG o PNG.";
    } else if (foto.size > MAX_INSPECTOR_PHOTO_BYTES) {
      errors.foto = "La foto no puede superar 5 MB.";
    }
    if (profile?.consentimientoDatos !== true) {
      errors.consentimientoDatos =
        "Autoriza el tratamiento de datos para continuar.";
    }
    if (Object.keys(errors).length === 0 && foto !== null) {
      inspectorProfile = {
        nombres,
        apellidos,
        documento,
        pais,
        experienciaAnios: experience,
        empleadorDeclarado: profile?.sinEmpleador ? "" : empleadorDeclarado,
        sinEmpleador: profile?.sinEmpleador === true,
        consentimientoDatos: true,
        foto,
      };
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name,
      email,
      marketingConsent: input.marketingConsent,
      ...(inspectorProfile === undefined ? {} : { inspectorProfile }),
    },
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
 * @param {boolean} [requiresInspectorProfile]
 * @returns {Feedback}
 */
export const describeRegistrationError = (
  result,
  requiresInspectorProfile = false,
) => {
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
        message: requiresInspectorProfile
          ? "Algún dato no tiene el formato esperado. Revisa el correo y los campos de la ficha e inténtalo de nuevo."
          : "Algún dato no tiene el formato esperado. Corrige el nombre y el correo e inténtalo de nuevo.",
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
    case "INSPECTOR_PROFILE_REQUIRED":
      return {
        target: "status",
        title: "Ficha requerida",
        message: "Completa la ficha del inspector para este evento.",
      };
    case "INSPECTOR_PROFILE_UNEXPECTED":
      return {
        target: "status",
        title: "Ficha no esperada",
        message:
          "Este evento no solicita una ficha del inspector. Recarga la página e inténtalo de nuevo.",
      };
    case "INSPECTOR_PROFILE_IN_PROGRESS":
      return {
        target: "status",
        title: "Inscripción en proceso",
        message:
          "Ya hay una inscripción con ficha en proceso. Espera unos minutos antes de volver a intentarlo.",
      };
    case "PAYLOAD_TOO_LARGE":
      return {
        target: "foto",
        message:
          "El archivo enviado supera el tamaño permitido. Selecciona una foto de hasta 5 MB.",
      };
    case "PHOTO_UPLOAD_FAILED":
      return {
        target: "status",
        title: "No pudimos guardar la foto",
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
