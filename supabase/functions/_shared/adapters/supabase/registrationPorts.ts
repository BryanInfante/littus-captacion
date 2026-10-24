import { createClient } from "../../deps.ts";
import type { Database } from "../../database.types.ts";
import { Email } from "../../domain/email.ts";
import { DomainError } from "../../domain/errors.ts";
import type { Event } from "../../domain/event.ts";
import type { Registration } from "../../domain/registration.ts";
import type { Events } from "../../ports/events.ts";
import type { Registrations } from "../../ports/registrations.ts";

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
    },
  };
};
