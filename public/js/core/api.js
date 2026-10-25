// @ts-check

// The single api client of the public site: every request to the backend goes
// through here, and this is the only module that knows endpoint paths and
// database column names. Untrusted responses are parsed once into the shapes
// below; pages never see raw rows or status codes.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

/** @typedef {"webinar" | "curso"} EventType */

/**
 * An active event as the public catalog publishes it.
 *
 * @typedef {object} PublicEvent
 * @property {string} code
 * @property {string} title
 * @property {EventType | null} type
 * @property {string | null} summary
 * @property {string | null} dateText
 * @property {string | null} date ISO calendar date (YYYY-MM-DD).
 * @property {string | null} duration
 * @property {Date | null} registrationOpensAt
 * @property {Date | null} registrationClosesAt
 * @property {boolean} requiresInspectorProfile
 */

/**
 * @typedef {object} RegistrationRequest
 * @property {string} eventCode
 * @property {string} name
 * @property {string} email
 * @property {boolean} marketingConsent
 * @property {string} challengeToken
 * @property {InspectorProfileRequest | undefined} [inspectorProfile]
 */

/**
 * @typedef {object} InspectorProfileRequest
 * @property {string} nombres
 * @property {string} apellidos
 * @property {string} documento
 * @property {string} pais
 * @property {number} experienciaAnios
 * @property {string} empleadorDeclarado
 * @property {boolean} sinEmpleador
 * @property {boolean} consentimientoDatos
 * @property {File} foto
 */

/**
 * The error codes of public-api, plus the two ways a request can fail outside
 * that contract.
 *
 * @typedef {"INVALID_INPUT" | "CHALLENGE_FAILED" | "EVENT_NOT_FOUND"
 *   | "ALREADY_REGISTERED" | "REGISTRATION_CLOSED" | "RATE_LIMITED"
 *   | "INTERNAL_ERROR" | "NETWORK_ERROR" | "UNEXPECTED_RESPONSE"
 *   | "INSPECTOR_PROFILE_REQUIRED" | "INSPECTOR_PROFILE_UNEXPECTED"
 *   | "INSPECTOR_PROFILE_IN_PROGRESS" | "PAYLOAD_TOO_LARGE"
 *   | "PHOTO_UPLOAD_FAILED"
 * } RegistrationError
 */

/**
 * @typedef {{ ok: true }
 *   | { ok: false, error: RegistrationError, retryAfterSeconds: number | null }
 * } RegistrationResult
 */

/** @typedef {(input: string, init?: RequestInit) => Promise<Response>} Fetch */

const CATALOG_COLUMNS = [
  "masterclass_codigo",
  "event_title",
  "tipo",
  "resumen",
  "fecha_texto",
  "fecha_evento",
  "duracion",
  "inscripcion_abre_en",
  "inscripcion_cierra_en",
  "requiere_ficha_inspector",
].join(",");

/** @type {Readonly<Record<string, number>>} */
const ERROR_STATUS = {
  INVALID_INPUT: 400,
  CHALLENGE_FAILED: 403,
  EVENT_NOT_FOUND: 404,
  ALREADY_REGISTERED: 409,
  REGISTRATION_CLOSED: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  INSPECTOR_PROFILE_REQUIRED: 400,
  INSPECTOR_PROFILE_UNEXPECTED: 400,
  INSPECTOR_PROFILE_IN_PROGRESS: 409,
  PAYLOAD_TOO_LARGE: 413,
  PHOTO_UPLOAD_FAILED: 502,
};

/** The catalog could not be read; the page cannot tell whether the event exists. */
export class CatalogUnavailableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {Record<string, unknown>} row
 * @param {string} column
 * @returns {string | null}
 */
const optionalText = (row, column) => {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new CatalogUnavailableError(`Unexpected ${column}`);
  }
  return value;
};

/**
 * @param {Record<string, unknown>} row
 * @param {string} column
 * @returns {Date | null}
 */
const optionalInstant = (row, column) => {
  const value = optionalText(row, column);
  if (value === null) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new CatalogUnavailableError(`Unexpected ${column}`);
  }
  return instant;
};

/**
 * @param {unknown} row
 * @param {string} code
 * @returns {PublicEvent}
 */
const parseCatalogRow = (row, code) => {
  if (!isRecord(row) || row.masterclass_codigo !== code) {
    throw new CatalogUnavailableError("Unexpected catalog row");
  }
  const title = row.event_title;
  if (typeof title !== "string") {
    throw new CatalogUnavailableError("Unexpected event_title");
  }
  const type = optionalText(row, "tipo");
  if (type !== null && type !== "webinar" && type !== "curso") {
    throw new CatalogUnavailableError("Unexpected tipo");
  }
  const requiresInspectorProfile = row.requiere_ficha_inspector;
  if (typeof requiresInspectorProfile !== "boolean") {
    throw new CatalogUnavailableError("Unexpected requiere_ficha_inspector");
  }
  return {
    code,
    title,
    type,
    summary: optionalText(row, "resumen"),
    dateText: optionalText(row, "fecha_texto"),
    date: optionalText(row, "fecha_evento"),
    duration: optionalText(row, "duracion"),
    registrationOpensAt: optionalInstant(row, "inscripcion_abre_en"),
    registrationClosesAt: optionalInstant(row, "inscripcion_cierra_en"),
    requiresInspectorProfile,
  };
};

/**
 * Retry-After from public-api is always whole seconds; an HTTP date or any
 * other value is treated as unknown rather than guessed.
 *
 * @param {Response} response
 * @returns {number | null}
 */
const retryAfterSeconds = (response) => {
  const value = response.headers.get("retry-after")?.trim() ?? "";
  if (!/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return seconds > 0 ? seconds : null;
};

/**
 * @param {Response} response
 * @returns {Promise<RegistrationError>}
 */
const registrationError = async (response) => {
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    // A body that is not JSON is classified by its status alone.
  }
  const code = isRecord(body) ? body.error : undefined;
  // A code counts only with the status public-api sends it with, so an error
  // page from a gateway cannot pass for a business answer.
  if (typeof code === "string" && ERROR_STATUS[code] === response.status) {
    return /** @type {RegistrationError} */ (code);
  }
  if (response.status === 429) return "RATE_LIMITED";
  if (response.status >= 500) return "INTERNAL_ERROR";
  return "UNEXPECTED_RESPONSE";
};

/**
 * @param {Fetch} fetchFn Injected so tests never reach the network. Called
 *   as a plain function: some browsers reject `fetch` invoked as a method of
 *   another object.
 */
export const createApiClient = (fetchFn) => ({
  /**
   * @param {string} code The event's `masterclass_codigo`.
   * @returns {Promise<PublicEvent | null>} null when no active event has the code.
   * @throws {CatalogUnavailableError}
   */
  fetchPublicEvent: async (code) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/eccia_eventos_publicos`);
    url.searchParams.set("masterclass_codigo", `eq.${code}`);
    url.searchParams.set("select", CATALOG_COLUMNS);
    /** @type {Response} */
    let response;
    /** @type {unknown} */
    let rows;
    try {
      response = await fetchFn(url.href, {
        method: "GET",
        headers: {
          accept: "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
      });
      rows = response.ok ? await response.json() : null;
    } catch {
      throw new CatalogUnavailableError("Catalog request failed");
    }
    if (!response.ok) {
      throw new CatalogUnavailableError(`Catalog status ${response.status}`);
    }
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new CatalogUnavailableError("Unexpected catalog response");
    }
    return rows.length === 0 ? null : parseCatalogRow(rows[0], code);
  },

  /**
   * @param {RegistrationRequest} registration
   * @returns {Promise<RegistrationResult>}
   */
  register: async (registration) => {
    /** @type {Response} */
    let response;
    const inspectorProfile = registration.inspectorProfile;
    /** @type {BodyInit} */
    let body;
    /** @type {HeadersInit} */
    let headers;
    if (inspectorProfile === undefined) {
      headers = { "content-type": "application/json" };
      body = JSON.stringify({
        event_code: registration.eventCode,
        nombre: registration.name,
        correo: registration.email,
        marketing_consent: registration.marketingConsent,
        challenge_token: registration.challengeToken,
      });
    } else {
      const form = new FormData();
      form.set("event_code", registration.eventCode);
      form.set("correo", registration.email);
      form.set("challenge_token", registration.challengeToken);
      form.set("marketing_consent", String(registration.marketingConsent));
      form.set("nombres", inspectorProfile.nombres);
      form.set("apellidos", inspectorProfile.apellidos);
      form.set("documento", inspectorProfile.documento);
      form.set("pais", inspectorProfile.pais);
      form.set("experiencia_anios", String(inspectorProfile.experienciaAnios));
      form.set("empleador_declarado", inspectorProfile.empleadorDeclarado);
      form.set("sin_empleador", String(inspectorProfile.sinEmpleador));
      form.set(
        "consentimiento_datos",
        String(inspectorProfile.consentimientoDatos),
      );
      form.set("foto", inspectorProfile.foto, inspectorProfile.foto.name);
      headers = {};
      body = form;
    }
    try {
      response = await fetchFn(
        `${SUPABASE_URL}/functions/v1/public-api/registrations`,
        {
          method: "POST",
          headers,
          body,
        },
      );
    } catch {
      return { ok: false, error: "NETWORK_ERROR", retryAfterSeconds: null };
    }
    if (response.status === 201) return { ok: true };
    const error = await registrationError(response);
    return {
      ok: false,
      error,
      retryAfterSeconds: error === "RATE_LIMITED"
        ? retryAfterSeconds(response)
        : null,
    };
  },
});
