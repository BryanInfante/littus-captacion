import { assertEquals, assertRejects, postgres } from "../dev_deps.ts";
import { createSupabaseInspectorProfiles } from "../../_shared/adapters/supabase/inspectorProfiles.ts";
import type { InspectorProfileReservation } from "../../_shared/ports/inspectorProfiles.ts";
import { localServiceRoleKey } from "../fixtures/localStack.ts";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const API_URL = "http://127.0.0.1:54321";
const STORAGE_ROOT = "Test Root";

Deno.test("Supabase inspector profile claim is atomic, retries the reserved path, completes and cascades compensation", async () => {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const code = `profile-port-${crypto.randomUUID()}`;
  const document = "AB123456";
  const email = `profile-${crypto.randomUUID()}@example.invalid`;
  const now = new Date();
  const profile = createSupabaseInspectorProfiles({
    url: API_URL,
    serviceRoleKey: await localServiceRoleKey(),
    rootDirectory: () => STORAGE_ROOT,
  });
  try {
    const [settings] = await sql<{ webhook_configured: boolean }[]>`
      select coalesce(nullif(btrim(current_setting('app.eccia_functions_base_url', true)), ''), '') <> ''
        as webhook_configured
    `;
    assertEquals(settings.webhook_configured, false);
    await sql`insert into public.eccia_eventos (masterclass_codigo,event_title,codigo_prefijo,activo,inscripcion_abre_en,requiere_ficha_inspector) values (${code},'Profile port fixture','ECCIA-TEST-',true,now(),true)`;
    const reservation = (
      id: string,
      reservationDocument = document,
    ): InspectorProfileReservation => ({
      id,
      eventCode: code,
      email,
      marketingConsent: true,
      nombres: "ANA",
      apellidos: "PEREZ",
      nombreCompleto: "ANA PEREZ",
      documento: reservationDocument,
      pais: "Ecuador",
      experienciaAnios: 0,
      empleadorDeclarado: null,
      sinEmpleador: true,
      consentimientoDatosEn: now.toISOString(),
      photoPath: `inscripciones/${code}/fotos/${reservationDocument}_${id}.jpg`,
    });
    const first = await profile.claim(
      reservation(crypto.randomUUID()),
      new Date(now.getTime() - 120_000),
      now,
    );
    assertEquals(first.kind, "claimed");
    if (first.kind !== "claimed") {
      throw new Error("Initial reservation was not claimed");
    }
    assertEquals(
      first.photoPath,
      `inscripciones/${code}/fotos/${document}_${first.id}.jpg`,
    );
    const [stored] = await sql<{ foto_path: string }[]>`
      select foto_path from public.eccia_fichas_inspector where id = ${first.id}
    `;
    assertEquals(stored.foto_path, `${STORAGE_ROOT}/${first.photoPath}`);
    const retryNow = new Date(now.getTime() + 121_000);
    const [retryA, retryB] = await Promise.all([
      profile.claim(
        reservation(crypto.randomUUID()),
        new Date(retryNow.getTime() - 120_000),
        retryNow,
      ),
      profile.claim(
        reservation(crypto.randomUUID()),
        new Date(retryNow.getTime() - 120_000),
        retryNow,
      ),
    ]);
    const claims = [retryA, retryB].filter((claim) => claim.kind === "claimed");
    assertEquals(claims.length, 1);
    const [retried] = claims;
    if (retried === undefined || retried.kind !== "claimed") {
      throw new Error("Expected one stale retry claim");
    }
    assertEquals(retried.id, first.id);
    assertEquals(retried.photoPath, first.photoPath);
    assertEquals(retried.registration.id, first.registration.id);
    assertEquals(
      retryA.kind === "in_progress" || retryB.kind === "in_progress",
      true,
    );
    const [registration] = await sql<
      { marketing_consent: boolean }[]
    >`select marketing_consent from public.eccia_taller_inscripciones where id = ${first.registration.id}`;
    assertEquals(registration.marketing_consent, true);
    await profile.markComplete(first.id, retryNow);
    assertEquals(
      (await profile.claim(
        reservation(crypto.randomUUID()),
        retryNow,
        retryNow,
      )).kind,
      "complete",
    );
    await profile.delete(first.id);
    const remaining = await sql<
      { count: number }[]
    >`select count(*)::int as count from public.eccia_taller_inscripciones where id = ${first.registration.id}`;
    assertEquals(remaining[0].count, 0);

    const mismatchId = crypto.randomUUID();
    const mismatchDocument = "CD654321";
    await sql`
      insert into public.eccia_fichas_inspector
        (id, masterclass_codigo, nombres, apellidos, nombre_completo,
         documento, correo, pais, experiencia_anios, sin_empleador,
         consentimiento_datos_en, estado, foto_path)
      values
        (${mismatchId}, ${code}, 'ANA', 'PEREZ', 'ANA PEREZ',
         ${mismatchDocument}, ${`mismatch-${crypto.randomUUID()}@example.invalid`},
         'Ecuador', 0, true, ${now}, 'pendiente_foto',
         ${`Test Root Evil/inscripciones/${code}/fotos/${mismatchDocument}_${mismatchId}.jpg`})
    `;
    await assertRejects(
      () =>
        profile.claim(
          reservation(crypto.randomUUID(), mismatchDocument),
          new Date(now.getTime() + 121_000),
          new Date(now.getTime() + 121_000),
        ),
      Error,
      "outside configured root",
    );
  } finally {
    await sql`delete from public.eccia_taller_inscripciones where taller_codigo = ${code}`;
    await sql`delete from public.eccia_eventos where masterclass_codigo = ${code}`;
    await sql.end();
  }
});
