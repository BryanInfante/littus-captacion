import { createClient } from "../../deps.ts";
import type { Database } from "../../database.types.ts";
import { Email } from "../../domain/email.ts";
import { DomainError } from "../../domain/errors.ts";
import type { InspectorProfiles } from "../../ports/inspectorProfiles.ts";
import type { InspectorProfileReservation } from "../../ports/inspectorProfiles.ts";

const registrationFor = (input: InspectorProfileReservation, id: string) => ({
  id,
  eventCode: input.eventCode,
  name: input.nombreCompleto,
  email: Email.parse(input.email),
  marketingConsent: input.marketingConsent,
});

export const createSupabaseInspectorProfiles = (config: {
  readonly url: string;
  readonly serviceRoleKey: string;
}): InspectorProfiles => {
  const client = createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return {
    claim: async (input, staleBefore, now) => {
      // The before-insert integrity trigger supplies inscripcion_id in the same transaction.
      const profileInsert = {
        id: input.id,
        masterclass_codigo: input.eventCode,
        nombres: input.nombres,
        apellidos: input.apellidos,
        nombre_completo: input.nombreCompleto,
        documento: input.documento,
        correo: input.email,
        pais: input.pais,
        experiencia_anios: input.experienciaAnios,
        empleador_declarado: input.empleadorDeclarado,
        sin_empleador: input.sinEmpleador,
        consentimiento_datos_en: input.consentimientoDatosEn,
        foto_path: input.photoPath,
        actualizado_en: now.toISOString(),
        marketing_consent: input.marketingConsent,
      } as unknown as Database["public"]["Tables"]["eccia_fichas_inspector"][
        "Insert"
      ];
      const { data: inserted, error: insertError } = await client
        .from("eccia_fichas_inspector")
        .insert(profileInsert)
        .select("id,inscripcion_id,estado,foto_path")
        .single();
      if (insertError === null && inserted !== null) {
        return {
          kind: "claimed",
          id: inserted.id,
          photoPath: inserted.foto_path,
          registration: registrationFor(input, inserted.inscripcion_id),
        };
      }
      if (insertError?.code !== "23505") {
        throw new Error("Inspector profile store unavailable");
      }

      const { data: existing, error: lookupError } = await client
        .from("eccia_fichas_inspector")
        .select("id,inscripcion_id,estado,foto_path,actualizado_en")
        .eq("masterclass_codigo", input.eventCode)
        .eq("documento", input.documento)
        .maybeSingle();
      if (lookupError !== null) {
        throw new Error("Inspector profile store unavailable");
      }
      if (existing === null) throw new DomainError("ALREADY_REGISTERED");
      if (existing.estado === "completa") return { kind: "complete" };
      if (new Date(existing.actualizado_en).getTime() > staleBefore.getTime()) {
        return { kind: "in_progress" };
      }
      const { data: claimed, error: claimError } = await client
        .from("eccia_fichas_inspector")
        .update({ actualizado_en: now.toISOString() })
        .eq("id", existing.id)
        .eq("estado", "pendiente_foto")
        .lte("actualizado_en", staleBefore.toISOString())
        .select("id,foto_path,inscripcion_id")
        .maybeSingle();
      if (claimError !== null) {
        throw new Error("Inspector profile claim unavailable");
      }
      if (claimed === null) return { kind: "in_progress" };
      return {
        kind: "claimed",
        id: claimed.id,
        photoPath: claimed.foto_path,
        registration: registrationFor(input, claimed.inscripcion_id),
      };
    },
    markComplete: async (id, now) => {
      const { data, error } = await client.from("eccia_fichas_inspector")
        .update({ estado: "completa", actualizado_en: now.toISOString() })
        .eq("id", id).eq("estado", "pendiente_foto").select("id").maybeSingle();
      if (error !== null || data === null) {
        throw new Error("Inspector profile completion unavailable");
      }
    },
    delete: async (id) => {
      const { data, error: lookupError } = await client.from(
        "eccia_fichas_inspector",
      )
        .select("inscripcion_id").eq("id", id).maybeSingle();
      if (lookupError !== null) {
        throw new Error("Inspector profile compensation unavailable");
      }
      if (data === null) return;
      // Registration deletion is the established cascade boundary for profile cleanup.
      const { error } = await client.from("eccia_taller_inscripciones").delete()
        .eq("id", data.inscripcion_id);
      if (error !== null) {
        throw new Error("Inspector profile compensation unavailable");
      }
    },
  };
};
