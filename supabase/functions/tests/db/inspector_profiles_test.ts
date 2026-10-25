import { assertEquals, assertRejects, postgres } from "../dev_deps.ts";

const URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

Deno.test("inspector profile reserves its photo and creates a registration atomically", async () => {
  const sql = postgres(URL, { max: 1, onnotice: () => {} });
  const rollback = new Error("rollback fixture");
  try {
    await assertRejects(
      () =>
        sql.begin(async (tx) => {
          const [event] =
            await tx`select requiere_ficha_inspector from public.eccia_eventos where masterclass_codigo = 'ultrasonido-nivel-ii'`;
          assertEquals(event.requiere_ficha_inspector, true);
          const id = "11111111-1111-4111-8111-111111111111";
          const path =
            `Test Root/inscripciones/ultrasonido-nivel-ii/fotos/AB123456_${id}.jpg`;
          const [profile] = await tx`
        insert into public.eccia_fichas_inspector
          (id, masterclass_codigo, documento, nombres, apellidos, nombre_completo,
           correo, pais, experiencia_anios, sin_empleador, foto_path, consentimiento_datos_en, marketing_consent)
        values (${id}, 'ultrasonido-nivel-ii', 'AB123456', 'ANA', 'PEREZ', 'ANA PEREZ',
                'profile@example.invalid', 'Ecuador', 0, true, ${path}, now(), true)
        returning inscripcion_id, estado
      `;
          assertEquals(profile.estado, "pendiente_foto");
          const [registration] =
            await tx`select nombre, marketing_consent from public.eccia_taller_inscripciones where id = ${profile.inscripcion_id}`;
          assertEquals(registration.nombre, "ANA PEREZ");
          assertEquals(registration.marketing_consent, true);
          // Cascading from the registration is the compensation's single transaction.
          await tx`delete from public.eccia_taller_inscripciones where id = ${profile.inscripcion_id}`;
          const rows =
            await tx`select id from public.eccia_fichas_inspector where id = ${id}`;
          assertEquals(rows.length, 0);
          throw rollback;
        }),
      Error,
      "rollback fixture",
    );
  } finally {
    await sql.end();
  }
});

Deno.test("inspector profile invariants and public access are enforced by Postgres", async (t) => {
  const sql = postgres(URL, { max: 1, onnotice: () => {} });
  try {
    await t.step(
      "the profile table is private and the trigger is a definer function",
      async () => {
        const privileges = await sql<{ role: string; privilege: string }[]>`
        select r.role, p.privilege
        from unnest(array['anon', 'authenticated', 'public']) as r(role)
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(privilege)
        where has_table_privilege(r.role, 'public.eccia_fichas_inspector', p.privilege)
        order by 1, 2
      `;
        assertEquals(privileges.length, 0);
        const [tableInfo] = await sql<{
          rls_enabled: boolean;
          service_select: boolean;
          service_insert: boolean;
          service_update: boolean;
          service_delete: boolean;
        }[]>`
        select c.relrowsecurity as rls_enabled,
          has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
          has_table_privilege('service_role', c.oid, 'INSERT') as service_insert,
          has_table_privilege('service_role', c.oid, 'UPDATE') as service_update,
          has_table_privilege('service_role', c.oid, 'DELETE') as service_delete
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'eccia_fichas_inspector'
      `;
        assertEquals(tableInfo, {
          rls_enabled: true,
          service_select: true,
          service_insert: true,
          service_update: true,
          service_delete: true,
        });
        const [functionInfo] = await sql<{
          security_definer: boolean;
          search_path: string | null;
          anon_execute: boolean;
          authenticated_execute: boolean;
        }[]>`
        select p.prosecdef as security_definer,
          (select setting from unnest(coalesce(p.proconfig, array[]::text[])) setting
            where setting like 'search_path=%') as search_path,
          has_function_privilege('anon', p.oid, 'execute') as anon_execute,
          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'eccia_ficha_crea_inscripcion'
      `;
        assertEquals(functionInfo, {
          security_definer: true,
          search_path: 'search_path=""',
          anon_execute: false,
          authenticated_execute: false,
        });
      },
    );

    await t.step(
      "pending recovery timestamp and marketing consent are persisted atomically",
      async () => {
        const columns = await sql<{ column_name: string }[]>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'eccia_fichas_inspector'
            and column_name in ('actualizado_en', 'marketing_consent')
          order by column_name
        `;
        assertEquals(columns.map((row) => row.column_name), [
          "actualizado_en",
          "marketing_consent",
        ]);
      },
    );

    await t.step(
      "database constraints reject unnormalized or out-of-range data",
      async () => {
        const check = async (values: {
          nombres?: string;
          apellidos?: string;
          nombreCompleto?: string;
          documento?: string;
          pais?: string;
          experiencia?: number;
          empleador?: string | null;
          sinEmpleador?: boolean;
          estado?: string;
          fotoPath?: string;
          consentimiento?: Date | null;
        }): Promise<string> => {
          const id = crypto.randomUUID();
          const rollback = new Error("rollback constraint probe");
          try {
            await sql.begin(async (tx) => {
              const nombres = values.nombres ?? "ANA";
              const apellidos = values.apellidos ?? "PEREZ";
              await tx`
              insert into public.eccia_fichas_inspector
                (id, masterclass_codigo, nombres, apellidos, nombre_completo,
                 documento, correo, pais, experiencia_anios, empleador_declarado,
                 sin_empleador, consentimiento_datos_en, estado, foto_path)
              values (${id}, 'ultrasonido-nivel-ii', ${nombres}, ${apellidos},
                ${values.nombreCompleto ?? `${nombres} ${apellidos}`},
                ${
                values.documento ?? "AB123456"
              }, ${`probe-${id}@example.invalid`},
                ${values.pais ?? "Ecuador"}, ${values.experiencia ?? 0},
                ${values.empleador ?? null}, ${values.sinEmpleador ?? true},
                ${
                values.consentimiento === undefined
                  ? new Date()
                  : values.consentimiento
              },
                ${values.estado ?? "pendiente_foto"},
                ${
                values.fotoPath ??
                  `Test Root/inscripciones/ultrasonido-nivel-ii/fotos/AB123456_${id}.jpg`
              })
            `;
              throw rollback;
            });
          } catch (error) {
            if (error === rollback) return "accepted";
            if (error instanceof postgres.PostgresError) {
              return error.constraint_name ?? error.code;
            }
            throw error;
          }
          return "accepted";
        };

        assertEquals(
          await check({ documento: "ab 12345" }),
          "eccia_fichas_inspector_documento_check",
        );
        assertEquals(
          await check({ nombres: "A", nombreCompleto: "A PEREZ" }),
          "eccia_fichas_inspector_nombres_check",
        );
        assertEquals(
          await check({ nombreCompleto: "PEREZ ANA" }),
          "eccia_fichas_inspector_nombre_completo_check",
        );
        assertEquals(
          await check({ pais: "X" }),
          "eccia_fichas_inspector_pais_check",
        );
        assertEquals(
          await check({ experiencia: 61 }),
          "eccia_fichas_inspector_experiencia_check",
        );
        assertEquals(
          await check({ empleador: "Empresa", sinEmpleador: true }),
          "eccia_fichas_inspector_empleador_check",
        );
        assertEquals(
          await check({ empleador: "X", sinEmpleador: false }),
          "eccia_fichas_inspector_empleador_check",
        );
        assertEquals(
          await check({ estado: "importada" }),
          "eccia_fichas_inspector_estado_check",
        );
        assertEquals(
          await check({ fotoPath: "https://example.invalid/photo.jpg" }),
          "eccia_fichas_inspector_foto_path_check",
        );
        assertEquals(
          await check({
            fotoPath:
              "Test Root/inscripciones/ultrasonido-nivel-ii/fotos/AB123456_11111111-1111-4111-8111-111111111111.jpg",
          }),
          "eccia_fichas_inspector_foto_path_check",
        );
        assertEquals(await check({ consentimiento: null }), "23502");
        assertEquals(await check({}), "accepted");
        assertEquals(
          await check({ empleador: "Empresa", sinEmpleador: false }),
          "accepted",
        );
      },
    );

    await t.step(
      "one document is allowed per event and duplicate attempts leave no registration",
      async () => {
        const id = crypto.randomUUID();
        const duplicateId = crypto.randomUUID();
        const rollback = new Error("rollback duplicate probe");
        await assertRejects(() =>
          sql.begin(async (tx) => {
            const insert = (profileId: string, email: string) =>
              tx`
          insert into public.eccia_fichas_inspector
            (id, masterclass_codigo, nombres, apellidos, nombre_completo,
             documento, correo, pais, experiencia_anios, sin_empleador,
             consentimiento_datos_en, foto_path)
          values (${profileId}, 'ultrasonido-nivel-ii', 'ANA', 'PEREZ', 'PEREZ ANA',
            'AB654321', ${email}, 'Ecuador', 0, true, now(),
            ${`Test Root/inscripciones/ultrasonido-nivel-ii/fotos/AB654321_${profileId}.png`})
        `;
            await insert(id, "first@example.invalid");
            await insert(duplicateId, "second@example.invalid");
            throw rollback;
          }), postgres.PostgresError);
        const [remaining] = await sql<{ count: number }[]>`
        select count(*)::int as count from public.eccia_taller_inscripciones
        where correo in ('first@example.invalid', 'second@example.invalid')
      `;
        assertEquals(remaining.count, 0);
      },
    );
  } finally {
    await sql.end();
  }
});
