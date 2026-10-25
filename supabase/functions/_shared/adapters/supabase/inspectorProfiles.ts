import { createClient } from "../../deps.ts";
import type { Database } from "../../database.types.ts";
import { Email } from "../../domain/email.ts";
import { DomainError } from "../../domain/errors.ts";
import type { InspectorProfiles } from "../../ports/inspectorProfiles.ts";
import type { InspectorProfileReservation } from "../../ports/inspectorProfiles.ts";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*$/;
const LEGACY_PHOTO_FILENAME =
  /^[0-9A-Z-]+_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$/;
const PHOTO_FILENAME = /^foto\.(jpg|png)$/;
const PARTICIPANT_FOLDER = /^([A-Z0-9]+( [A-Z0-9]+)* - )?[0-9A-Z-]+$/;

const rootSegments = (rootDirectory: string): string[] => {
  const segments = rootDirectory.split("/");
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error("Inspector profile storage root unavailable");
  }
  return segments;
};

const relativePhotoPath = (
  path: string,
  eventCode: string,
  document: string,
): string => {
  const segments = path.split("/");
  const legacy = segments.length === 4 && segments[2] === "fotos" &&
    segments[3].startsWith(`${document}_`) &&
    LEGACY_PHOTO_FILENAME.test(segments[3]);
  // The folder is either the bare document or ends with " - <document>".
  const participant = segments.length === 4 &&
    PARTICIPANT_FOLDER.test(segments[2]) &&
    (segments[2] === document || segments[2].endsWith(` - ${document}`)) &&
    PHOTO_FILENAME.test(segments[3]);
  if (
    segments[0] !== "inscripciones" || segments[1] !== eventCode ||
    !(legacy || participant)
  ) {
    throw new Error("Inspector profile photo path is invalid");
  }
  return path;
};

const storedPhotoPath = (
  path: string,
  root: readonly string[],
  eventCode: string,
  document: string,
): string => {
  const segments = path.split("/");
  if (
    segments.length !== root.length + 4 ||
    root.some((segment, index) => segments[index] !== segment)
  ) {
    throw new Error("Inspector profile path is outside configured root");
  }
  return relativePhotoPath(
    segments.slice(root.length).join("/"),
    eventCode,
    document,
  );
};

const persistedPhotoPath = (
  path: string,
  root: readonly string[],
  eventCode: string,
  document: string,
): string =>
  `${root.join("/")}/${relativePhotoPath(path, eventCode, document)}`;

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
  readonly rootDirectory: () => string;
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
      // Resolve the root once and validate paths before any database mutation.
      const root = rootSegments(config.rootDirectory());
      const photoPath = relativePhotoPath(
        input.photoPath,
        input.eventCode,
        input.documento,
      );
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
        foto_path: persistedPhotoPath(
          photoPath,
          root,
          input.eventCode,
          input.documento,
        ),
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
          photoPath,
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
      const existingPhotoPath = storedPhotoPath(
        existing.foto_path,
        root,
        input.eventCode,
        input.documento,
      );
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
        photoPath: existingPhotoPath,
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
