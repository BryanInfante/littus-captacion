import { createClient } from "../../deps.ts";
import type { Database } from "../../database.types.ts";
import {
  CONFIRMATION_MAX_ATTEMPTS,
  type ConfirmationFailureCode,
  type ConfirmationReadiness,
  confirmationRetryBounds,
  type ConfirmationState,
} from "../../domain/confirmation.ts";
import { Email } from "../../domain/email.ts";
import { DomainError } from "../../domain/errors.ts";
import type { Event, EventContent } from "../../domain/event.ts";
import type { Registration } from "../../domain/registration.ts";
import type { Events } from "../../ports/events.ts";
import type {
  RegistrationConfirmation,
  Registrations,
} from "../../ports/registrations.ts";

type EventRow = Database["public"]["Tables"]["eccia_eventos"]["Row"];
type RegistrationRow =
  Database["public"]["Tables"]["eccia_taller_inscripciones"]["Row"];
type RegistrationInsert =
  Database["public"]["Tables"]["eccia_taller_inscripciones"]["Insert"];

const eventFromRow = (
  row: Pick<
    EventRow,
    | "masterclass_codigo"
    | "activo"
    | "inscripcion_abre_en"
    | "inscripcion_cierra_en"
    | "requiere_ficha_inspector"
  >,
): Event => ({
  code: row.masterclass_codigo,
  active: row.activo,
  registrationOpensAt: row.inscripcion_abre_en === null
    ? null
    : new Date(row.inscripcion_abre_en),
  registrationClosesAt: row.inscripcion_cierra_en === null
    ? null
    : new Date(row.inscripcion_cierra_en),
  requiresInspectorProfile: row.requiere_ficha_inspector,
});

const registrationFromRow = (
  row: Pick<
    RegistrationRow,
    "id" | "nombre" | "correo" | "taller_codigo" | "marketing_consent"
  >,
): Registration => ({
  id: row.id,
  name: row.nombre,
  email: Email.parse(row.correo),
  eventCode: row.taller_codigo,
  marketingConsent: row.marketing_consent,
});

const EVENT_CONTENT_COLUMNS =
  "masterclass_codigo,event_title,tipo,fecha_texto,duracion,horario_texto,modalidad_texto,incluye_texto,comunidad_url,transmision_url,aula_url,siguientes_pasos_texto";

const contentFromRow = (
  row: Pick<
    EventRow,
    | "masterclass_codigo"
    | "event_title"
    | "tipo"
    | "fecha_texto"
    | "duracion"
    | "horario_texto"
    | "modalidad_texto"
    | "incluye_texto"
    | "comunidad_url"
    | "transmision_url"
    | "aula_url"
    | "siguientes_pasos_texto"
  >,
): EventContent => ({
  code: row.masterclass_codigo,
  title: row.event_title,
  kind: row.tipo,
  dateText: row.fecha_texto,
  durationText: row.duracion,
  scheduleText: row.horario_texto,
  modalityText: row.modalidad_texto,
  includesText: row.incluye_texto,
  communityUrl: row.comunidad_url,
  streamUrl: row.transmision_url,
  classroomUrl: row.aula_url,
  nextStepsText: row.siguientes_pasos_texto,
});

const CONFIRMATION_COLUMNS =
  "id,nombre,correo,taller_codigo,marketing_consent,confirmation_sent_at,confirmation_resend_email_id,confirmation_attempts,confirmation_last_attempt_at,confirmation_error";

// The legacy function stored free-form provider text in confirmation_error;
// anything that is not a known code reads back as an unexpected error.
const failureCodeFromColumn = (
  value: string | null,
): ConfirmationFailureCode | null =>
  value === null
    ? null
    : value === "MAIL_DELIVERY_FAILED"
    ? value
    : "UNEXPECTED_ERROR";

const confirmationFromRow = (
  readiness: ConfirmationReadiness,
  row: Pick<
    RegistrationRow,
    | "id"
    | "nombre"
    | "correo"
    | "taller_codigo"
    | "marketing_consent"
    | "confirmation_sent_at"
    | "confirmation_resend_email_id"
    | "confirmation_attempts"
    | "confirmation_last_attempt_at"
    | "confirmation_error"
  >,
): RegistrationConfirmation => ({
  registration: registrationFromRow(row),
  readiness,
  confirmation: {
    sentAt: row.confirmation_sent_at === null
      ? null
      : new Date(row.confirmation_sent_at),
    emailId: row.confirmation_resend_email_id,
    attempts: row.confirmation_attempts,
    lastAttemptAt: row.confirmation_last_attempt_at === null
      ? null
      : new Date(row.confirmation_last_attempt_at),
    lastError: failureCodeFromColumn(row.confirmation_error),
  },
});

const confirmationUpdate = (
  state: ConfirmationState,
): Database["public"]["Tables"]["eccia_taller_inscripciones"]["Update"] => ({
  confirmation_sent_at: state.sentAt === null
    ? null
    : state.sentAt.toISOString(),
  confirmation_resend_email_id: state.emailId,
  confirmation_attempts: state.attempts,
  confirmation_last_attempt_at: state.lastAttemptAt === null
    ? null
    : state.lastAttemptAt.toISOString(),
  confirmation_error: state.lastError,
});

export const createSupabasePorts = (config: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): { events: Events; registrations: Registrations } => {
  // A dedicated server client never adopts a browser/user session.
  const client = createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  // Whether the event collects an inspector profile and, if so, whether this
  // registration's profile is complete (see isReadyForConfirmation).
  const readinessOf = async (
    registrationId: string,
    eventCode: string,
  ): Promise<ConfirmationReadiness> => {
    const { data: event, error: eventError } = await client
      .from("eccia_eventos").select("requiere_ficha_inspector")
      .eq("masterclass_codigo", eventCode).maybeSingle();
    if (eventError !== null) throw new Error("Event repository unavailable");
    const requiresInspectorProfile = event?.requiere_ficha_inspector ?? false;
    if (!requiresInspectorProfile) {
      return { requiresInspectorProfile, inspectorProfileComplete: false };
    }
    const { data: profile, error: profileError } = await client
      .from("eccia_fichas_inspector").select("estado")
      .eq("inscripcion_id", registrationId).maybeSingle();
    if (profileError !== null) {
      throw new Error("Inspector profile repository unavailable");
    }
    return {
      requiresInspectorProfile,
      inspectorProfileComplete: profile?.estado === "completa",
    };
  };
  return {
    events: {
      findByCode: async (code) => {
        const { data, error } = await client.from("eccia_eventos")
          .select(
            "masterclass_codigo,activo,inscripcion_abre_en,inscripcion_cierra_en,requiere_ficha_inspector",
          )
          .eq("masterclass_codigo", code).maybeSingle();
        if (error !== null) throw new Error("Event repository unavailable");
        return data === null ? null : eventFromRow(data);
      },
      findContentByCode: async (code) => {
        const { data, error } = await client.from("eccia_eventos")
          .select(EVENT_CONTENT_COLUMNS)
          .eq("masterclass_codigo", code).maybeSingle();
        if (error !== null) throw new Error("Event repository unavailable");
        return data === null ? null : contentFromRow(data);
      },
    },
    registrations: {
      create: async (input) => {
        const row: RegistrationInsert = {
          nombre: input.name,
          correo: input.email.value,
          taller_codigo: input.eventCode,
          marketing_consent: input.marketingConsent,
        };
        const { data, error } = await client.from("eccia_taller_inscripciones")
          .insert(row).select(
            "id,nombre,correo,taller_codigo,marketing_consent",
          )
          .single();
        if (error !== null) {
          if (error.code === "23505") {
            throw new DomainError("ALREADY_REGISTERED");
          }
          if (error.code === "23503") throw new DomainError("EVENT_NOT_FOUND");
          throw new Error("Registration repository unavailable");
        }
        if (data === null) {
          throw new Error("Registration repository returned no row");
        }
        return registrationFromRow(data);
      },
      findForConfirmation: async (id) => {
        const { data, error } = await client.from("eccia_taller_inscripciones")
          .select(CONFIRMATION_COLUMNS).eq("id", id).maybeSingle();
        if (error !== null) {
          throw new Error("Registration repository unavailable");
        }
        if (data === null) return null;
        const readiness = await readinessOf(data.id, data.taller_codigo);
        return confirmationFromRow(readiness, data);
      },
      saveConfirmation: async (id, state) => {
        // The sent_at guard keeps a concurrent replay from overwriting the
        // winner's email id.
        const { error } = await client.from("eccia_taller_inscripciones")
          .update(confirmationUpdate(state)).eq("id", id)
          .is("confirmation_sent_at", null);
        if (error !== null) {
          throw new Error("Registration repository unavailable");
        }
      },
      findPendingConfirmations: async ({ now, limit }) => {
        // Same rule as isConfirmationRetryDue, expressed as a query.
        const { dueBefore, createdAfter } = confirmationRetryBounds(now);
        const due = dueBefore.toISOString();
        const { data, error } = await client.from("eccia_taller_inscripciones")
          .select("id")
          .is("confirmation_sent_at", null)
          .lt("confirmation_attempts", CONFIRMATION_MAX_ATTEMPTS)
          .gt("creado_en", createdAfter.toISOString())
          .or(
            `and(confirmation_last_attempt_at.is.null,creado_en.lte.${due}),confirmation_last_attempt_at.lte.${due}`,
          )
          .order("creado_en", { ascending: true })
          .limit(limit);
        if (error !== null) {
          throw new Error("Registration repository unavailable");
        }
        return data.map((row) => row.id);
      },
    },
  };
};
