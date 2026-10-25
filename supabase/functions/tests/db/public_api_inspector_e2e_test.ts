import { assertEquals, postgres } from "../dev_deps.ts";
import { createRequestLimitHasher } from "../../_shared/adapters/crypto/requestLimitHash.ts";
import { createSupabaseInspectorProfiles } from "../../_shared/adapters/supabase/inspectorProfiles.ts";
import { createSupabasePorts } from "../../_shared/adapters/supabase/registrationPorts.ts";
import { createSupabaseRequestLimits } from "../../_shared/adapters/supabase/requestLimits.ts";
import { createNextcloudFileStorage } from "../../_shared/adapters/nextcloud/fileStorage.ts";
import { createLogger } from "../../_shared/log.ts";
import { createHandler } from "../../public-api/index.ts";
import { localServiceRoleKey } from "../fixtures/localStack.ts";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const API_URL = "http://127.0.0.1:54321";
const ROUTE = `${API_URL}/functions/v1/public-api/registrations`;
const HASH_SECRET = "local-only-inspector-integration-fixture";
const STORAGE_ROOT = "Test Root";
const WEBDAV_URL = "http://127.0.0.1/remote.php/dav/files/local-fixture";

const pngBytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/u7sAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

const multipartRequest = (input: {
  eventCode: string;
  email: string;
  document: string;
}): Request => {
  const form = new FormData();
  for (
    const [key, value] of Object.entries({
      event_code: input.eventCode,
      correo: input.email,
      challenge_token: "local-fixture-challenge",
      marketing_consent: "true",
      nombres: "Ana María",
      apellidos: "Pérez",
      documento: input.document,
      pais: "Ecuador",
      experiencia_anios: "0",
      empleador_declarado: "",
      sin_empleador: "true",
      consentimiento_datos: "true",
    })
  ) form.set(key, value);
  form.set(
    "foto",
    new File([pngBytes], "inspector.png", { type: "image/png" }),
  );
  return new Request(ROUTE, {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1",
      "x-forwarded-for": "203.0.113.18",
    },
    body: form,
  });
};

Deno.test("public-api creates and compensates inspector registrations against local Supabase", async () => {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const eventCode = `inspector-test-${crypto.randomUUID()}`;
  const successfulEmail = `${crypto.randomUUID()}@example.invalid`;
  const failedEmail = `${crypto.randomUUID()}@example.invalid`;
  const remoteIp = "203.0.113.18";
  const serviceRoleKey = await localServiceRoleKey();
  const requestLimitHasher = createRequestLimitHasher(HASH_SECRET);
  const limitKeys = [
    await requestLimitHasher({ kind: "ip", value: remoteIp }),
    await requestLimitHasher({ kind: "email", value: successfulEmail }),
    await requestLimitHasher({ kind: "email", value: failedEmail }),
  ];
  const webdavCalls: {
    url: string;
    method: string;
    contentType: string | null;
  }[] = [];
  let failNextUpload = false;
  const fileStorage = createNextcloudFileStorage({
    webdavUrl: WEBDAV_URL,
    username: "local-fixture",
    appPassword: "local-fixture-only",
    rootDirectory: STORAGE_ROOT,
  }, (input, init) => {
    const method = init?.method ?? "GET";
    webdavCalls.push({
      url: String(input),
      method,
      contentType: new Headers(init?.headers).get("content-type"),
    });
    if (method === "MKCOL") {
      return Promise.resolve(new Response(null, { status: 405 }));
    }
    if (method === "PUT" && failNextUpload) {
      failNextUpload = false;
      return Promise.resolve(new Response(null, { status: 500 }));
    }
    if (method === "PUT") {
      return Promise.resolve(new Response(null, { status: 201 }));
    }
    if (method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    throw new Error("Unexpected local WebDAV method");
  });

  try {
    const [settings] = await sql<{
      webhook_configured: boolean;
    }[]>`
      select coalesce(nullif(btrim(current_setting('app.eccia_functions_base_url', true)), ''), '') <> ''
        as webhook_configured
    `;
    assertEquals(
      settings.webhook_configured,
      false,
      "local integration must not run when database webhooks have a destination",
    );

    await sql`
      insert into public.eccia_eventos
        (masterclass_codigo, event_title, codigo_prefijo, activo,
         inscripcion_abre_en, requiere_ficha_inspector)
      values
        (${eventCode}, 'Local inspector integration fixture', 'ECCIA-TEST-', true,
         now() - interval '1 minute', true)
    `;
    const handler = createHandler({
      ...createSupabasePorts({ url: API_URL, serviceRoleKey }),
      inspectorProfiles: createSupabaseInspectorProfiles({
        url: API_URL,
        serviceRoleKey,
        rootDirectory: () => STORAGE_ROOT,
      }),
      fileStorage,
      humanChallenge: {
        verify: (token, ip) =>
          Promise.resolve(
            token === "local-fixture-challenge" && ip === remoteIp,
          ),
      },
      requestLimits: createSupabaseRequestLimits({
        url: API_URL,
        serviceRoleKey,
        hashSecret: HASH_SECRET,
      }),
      now: () => new Date(),
      publicSiteUrl: "http://127.0.0.1",
      logger: createLogger(() => {}),
      requestId: () => crypto.randomUUID(),
    });

    const success = await handler(multipartRequest({
      eventCode,
      email: successfulEmail,
      document: "AB123456",
    }));
    const successBody = await success.json();
    assertEquals(success.status, 201, JSON.stringify(successBody));
    assertEquals(typeof successBody.id, "string");
    assertEquals(successBody.event_code, eventCode);

    const [profile] = await sql<{
      id: string;
      inscripcion_id: string;
      nombres: string;
      apellidos: string;
      nombre_completo: string;
      estado: string;
      foto_path: string;
    }[]>`
      select id, inscripcion_id, nombres, apellidos, nombre_completo, estado, foto_path
      from public.eccia_fichas_inspector where inscripcion_id = ${successBody.id}
    `;
    assertEquals(typeof profile.id, "string");
    assertEquals(profile.inscripcion_id, successBody.id);
    const relativePath =
      `inscripciones/${eventCode}/fotos/AB123456_${profile.id}.png`;
    assertEquals(profile, {
      id: profile.id,
      inscripcion_id: profile.inscripcion_id,
      nombres: "ANA MARÍA",
      apellidos: "PÉREZ",
      nombre_completo: "ANA MARÍA PÉREZ",
      estado: "completa",
      foto_path: `${STORAGE_ROOT}/${relativePath}`,
    });
    const [registration] = await sql<{
      id: string;
      nombre: string;
      correo: string;
      taller_codigo: string;
      marketing_consent: boolean;
    }[]>`
      select id, nombre, correo, taller_codigo, marketing_consent
      from public.eccia_taller_inscripciones where id = ${profile.inscripcion_id}
    `;
    assertEquals(registration, {
      id: profile.inscripcion_id,
      nombre: "ANA MARÍA PÉREZ",
      correo: successfulEmail,
      taller_codigo: eventCode,
      marketing_consent: true,
    });
    const successfulUpload = webdavCalls.find((call) => call.method === "PUT");
    assertEquals(successfulUpload?.contentType, "image/png");
    assertEquals(
      successfulUpload?.url,
      `${WEBDAV_URL}/${encodeURIComponent(STORAGE_ROOT)}/${relativePath}`,
    );

    failNextUpload = true;
    const failed = await handler(multipartRequest({
      eventCode,
      email: failedEmail,
      document: "CD654321",
    }));
    assertEquals(failed.status, 502);
    assertEquals(await failed.json(), { error: "PHOTO_UPLOAD_FAILED" });
    const compensated = await sql<{
      registration_count: number;
      profile_count: number;
    }[]>`
      select
        (select count(*)::int from public.eccia_taller_inscripciones
         where correo = ${failedEmail}) as registration_count,
        (select count(*)::int from public.eccia_fichas_inspector
         where masterclass_codigo = ${eventCode} and documento = 'CD654321')
          as profile_count
    `;
    assertEquals(compensated[0], { registration_count: 0, profile_count: 0 });
    const failedDelete = webdavCalls.find((call) =>
      call.method === "DELETE" && call.url.includes("CD654321")
    );
    assertEquals(
      failedDelete?.url.includes(
        `/${
          encodeURIComponent(STORAGE_ROOT)
        }/inscripciones/${eventCode}/fotos/CD654321_`,
      ),
      true,
    );
    assertEquals(
      failedDelete?.url.includes(
        `/${encodeURIComponent(STORAGE_ROOT)}/${
          encodeURIComponent(STORAGE_ROOT)
        }/`,
      ),
      false,
    );
  } finally {
    await sql`delete from public.eccia_taller_inscripciones where taller_codigo = ${eventCode}`;
    await sql`delete from public.eccia_eventos where masterclass_codigo = ${eventCode}`;
    await sql`delete from public.eccia_limites_solicitud where clave_hash in ${
      sql(limitKeys)
    }`;
    await sql.end();
  }
});
