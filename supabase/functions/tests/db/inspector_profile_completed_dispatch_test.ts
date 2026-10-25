import { assertEquals, postgres } from "../dev_deps.ts";
import { createSupabasePorts } from "../../_shared/adapters/supabase/registrationPorts.ts";
import { localServiceRoleKey } from "../fixtures/localStack.ts";
import { parseRegistrationCreated } from "../../_shared/http/registrationCreated.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TABLE = "public.eccia_fichas_inspector";
const ROUTE = "db-events/registration-created";

Deno.test("an inspector profile that becomes complete dispatches the registration confirmation", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const id = crypto.randomUUID();
  const fakeSecret = `local-only-${id}`;
  const baseUrl = `http://127.0.0.1:1/profile-dispatch-test-${id}`;
  const rollback = new Error(`rollback-${id}`);

  // Runs the body in a transaction that always rolls back, with the dispatch
  // configuration pointing at an unreachable address.
  const withRollback = async (body: (tx: typeof sql) => Promise<void>) => {
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into private.eccia_config (key, value)
          values ('functions_base_url', ${baseUrl}), ('webhook_secret', ${fakeSecret})
          on conflict (key) do update set value = excluded.value
        `;
        await body(tx as unknown as typeof sql);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  };

  const insertProfile = async (
    tx: typeof sql,
    state: "pendiente_foto" | "completa",
  ) => {
    const profileId = crypto.randomUUID();
    const path =
      `Test Root/inscripciones/ultrasonido-nivel-ii/fotos/AB123456_${profileId}.jpg`;
    const [profile] = await tx<{ id: string; inscripcion_id: string }[]>`
      insert into ${tx(TABLE)}
        (id, masterclass_codigo, documento, nombres, apellidos, nombre_completo,
         correo, pais, experiencia_anios, sin_empleador, foto_path,
         consentimiento_datos_en, estado)
      values (${profileId}, 'ultrasonido-nivel-ii', 'AB123456', 'ANA', 'PEREZ',
              'ANA PEREZ', ${`${id}@example.invalid`}, 'Ecuador', 0, true, ${path},
              now(), ${state})
      returning id, inscripcion_id
    `;
    return profile;
  };

  // Requests queued for this route that carry the registration id.
  const requestsFor = async (tx: typeof sql, registrationId: string) => {
    const rows = await tx<
      { headers: Record<string, string>; body: Uint8Array }[]
    >`
      select headers, body from net.http_request_queue
      where url = ${`${baseUrl}/${ROUTE}`}
    `;
    const matching = [];
    for (const row of rows) {
      const parsed = await parseRegistrationCreated(
        new Request("http://localhost/db-events/registration-created", {
          method: "POST",
          body: new TextDecoder().decode(row.body),
        }),
      );
      if (parsed.registrationId === registrationId) matching.push(row);
    }
    return matching;
  };

  try {
    await t.step(
      "completing the profile enqueues exactly one authenticated request for its registration",
      async () => {
        await withRollback(async (tx) => {
          const profile = await insertProfile(tx, "pendiente_foto");
          // The registration insert already dispatched once, before the photo.
          const before = await requestsFor(tx, profile.inscripcion_id);
          assertEquals(before.length, 1);

          await tx`update ${
            tx(TABLE)
          } set estado = 'completa' where id = ${profile.id}`;

          const after = await requestsFor(tx, profile.inscripcion_id);
          assertEquals(after.length, 2);
          assertEquals(after[1].headers["x-eccia-webhook-secret"], fakeSecret);
        });
      },
    );

    await t.step(
      "an update that does not complete the profile enqueues nothing",
      async () => {
        await withRollback(async (tx) => {
          const profile = await insertProfile(tx, "pendiente_foto");
          await tx`update ${
            tx(TABLE)
          } set pais = 'Peru' where id = ${profile.id}`;
          assertEquals(
            (await requestsFor(tx, profile.inscripcion_id)).length,
            1,
          );
        });
      },
    );

    await t.step(
      "re-saving a complete profile does not dispatch again",
      async () => {
        await withRollback(async (tx) => {
          const profile = await insertProfile(tx, "pendiente_foto");
          await tx`update ${
            tx(TABLE)
          } set estado = 'completa' where id = ${profile.id}`;
          await tx`update ${
            tx(TABLE)
          } set estado = 'completa', pais = 'Peru' where id = ${profile.id}`;
          assertEquals(
            (await requestsFor(tx, profile.inscripcion_id)).length,
            2,
          );
        });
      },
    );

    await t.step(
      "a profile inserted already complete dispatches once more",
      async () => {
        await withRollback(async (tx) => {
          const profile = await insertProfile(tx, "completa");
          assertEquals(
            (await requestsFor(tx, profile.inscripcion_id)).length,
            2,
          );
        });
      },
    );

    await t.step(
      "the completion dispatch function runs as owner with an empty search path and closed to API roles",
      async () => {
        const rows = await sql<{
          trigger: string;
          security_definer: boolean;
          search_path_empty: boolean;
          anon: boolean;
          authenticated: boolean;
          public_role: boolean;
        }[]>`
          select t.tgname::text as trigger,
                 p.prosecdef as security_definer,
                 coalesce('search_path=""' = any(p.proconfig), false) as search_path_empty,
                 has_function_privilege('anon', p.oid, 'execute') as anon,
                 has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
                 has_function_privilege('public', p.oid, 'execute') as public_role
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = ${TABLE}::regclass and not t.tgisinternal
            and p.prosrc like '%db-events/registration-created%'
          order by 1
        `;
        assertEquals(rows.map((row) => row.trigger), [
          "eccia_dispatch_inspector_profile_completed_after_insert",
          "eccia_dispatch_inspector_profile_completed_after_update",
        ]);
        for (const row of rows) {
          assertEquals({ ...row, trigger: "" }, {
            trigger: "",
            security_definer: true,
            search_path_empty: true,
            anon: false,
            authenticated: false,
            public_role: false,
          });
        }
      },
    );
  } finally {
    await sql.end();
  }
});

Deno.test("Supabase confirmation read model reports whether the inspector profile is complete", async () => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const code = `readiness-${crypto.randomUUID()}`;
  const profileId = crypto.randomUUID();
  const { registrations } = createSupabasePorts({
    url: "http://127.0.0.1:54321",
    serviceRoleKey: await localServiceRoleKey(),
  });
  try {
    const [settings] = await sql<{ configured: boolean }[]>`
      select coalesce(nullif(btrim(current_setting('app.eccia_functions_base_url', true)), ''), '') <> ''
        or exists (select 1 from private.eccia_config
                   where key = 'functions_base_url' and btrim(value) <> '') as configured
    `;
    assertEquals(
      settings.configured,
      false,
      "Use an isolated local stack with webhook dispatch unconfigured",
    );
    await sql`insert into public.eccia_eventos (masterclass_codigo,event_title,codigo_prefijo,activo,inscripcion_abre_en,requiere_ficha_inspector) values (${code},'Readiness fixture','ECCIA-TEST-',true,now(),true)`;
    const path =
      `Test Root/inscripciones/${code}/fotos/AB123456_${profileId}.jpg`;
    const [profile] = await sql<{ inscripcion_id: string }[]>`
      insert into public.eccia_fichas_inspector
        (id, masterclass_codigo, documento, nombres, apellidos, nombre_completo,
         correo, pais, experiencia_anios, sin_empleador, foto_path, consentimiento_datos_en)
      values (${profileId}, ${code}, 'AB123456', 'ANA', 'PEREZ', 'ANA PEREZ',
              'readiness@example.invalid', 'Ecuador', 0, true, ${path}, now())
      returning inscripcion_id
    `;
    assertEquals(
      (await registrations.findForConfirmation(profile.inscripcion_id))
        ?.readiness,
      { requiresInspectorProfile: true, inspectorProfileComplete: false },
    );
    await sql`update public.eccia_fichas_inspector set estado = 'completa' where id = ${profileId}`;
    assertEquals(
      (await registrations.findForConfirmation(profile.inscripcion_id))
        ?.readiness,
      { requiresInspectorProfile: true, inspectorProfileComplete: true },
    );
  } finally {
    await sql`delete from public.eccia_taller_inscripciones where taller_codigo = ${code}`;
    await sql`delete from public.eccia_eventos where masterclass_codigo = ${code}`;
    await sql.end();
  }
});
