import { assertEquals, postgres } from "../dev_deps.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_REST_URL = "http://127.0.0.1:54321/rest/v1";
// The Supabase CLI's fixed local publishable key, not a project credential.
// It is what the browser holds in production (a publishable key mapped to the
// anon role), so the contract runs through the same gateway path.
const LOCAL_PUBLISHABLE_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

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
];

const ACTIVE_CODE = "prueba-catalogo-activo";
const INACTIVE_CODE = "prueba-catalogo-inactivo";

const rest = (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${LOCAL_REST_URL}/${path}`, {
    ...init,
    headers: {
      apikey: LOCAL_PUBLISHABLE_KEY,
      "content-type": "application/json",
      ...init.headers,
    },
  });

const errorCode = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "code" in body
    ? body.code
    : body;
};

Deno.test("the public event catalog exposes only allow-listed columns of active events", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    try {
      await sql`select 1`;
    } catch (error) {
      throw new Error(
        "Local Supabase stack is not reachable at 127.0.0.1:54322; run `supabase start`.",
        { cause: error },
      );
    }

    await t.step(
      "tipo and resumen are nullable text columns without defaults",
      async () => {
        const rows = await sql<{
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
        }[]>`
          select column_name, data_type, is_nullable, column_default
          from information_schema.columns
          where table_schema = 'public' and table_name = 'eccia_eventos'
            and column_name in ('tipo', 'resumen')
          order by column_name
        `;
        assertEquals(rows.map((row) => ({ ...row })), [
          {
            column_name: "resumen",
            data_type: "text",
            is_nullable: "YES",
            column_default: null,
          },
          {
            column_name: "tipo",
            data_type: "text",
            is_nullable: "YES",
            column_default: null,
          },
        ]);
      },
    );

    await t.step("tipo and resumen checks reject invalid values", async () => {
      const attempt = async (
        tipo: string | null,
        resumen: string | null,
      ): Promise<string> => {
        const rollback = new Error("Rollback catalog fixture");
        try {
          await sql.begin(async (tx) => {
            await tx`
              insert into public.eccia_eventos
                (masterclass_codigo, event_title, codigo_prefijo, tipo, resumen)
              values (${ACTIVE_CODE}, 'Evento de prueba', 'PRU-CAT-', ${tipo},
                      ${resumen})
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

      assertEquals(await attempt(null, null), "accepted");
      assertEquals(await attempt("webinar", "Un párrafo."), "accepted");
      assertEquals(await attempt("curso", "x".repeat(600)), "accepted");
      assertEquals(await attempt("taller", null), "eccia_eventos_tipo_check");
      assertEquals(await attempt("Webinar", null), "eccia_eventos_tipo_check");
      assertEquals(await attempt(null, "   "), "eccia_eventos_resumen_check");
      assertEquals(
        await attempt(null, " Con espacios al borde "),
        "eccia_eventos_resumen_check",
      );
      assertEquals(
        await attempt(null, "x".repeat(601)),
        "eccia_eventos_resumen_check",
      );
    });

    await t.step(
      "the view lists exactly the catalog columns and runs as a barrier with owner rights",
      async () => {
        const columns = await sql<{ column_name: string }[]>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'eccia_eventos_publicos'
          order by ordinal_position
        `;
        assertEquals(columns.map((row) => row.column_name), CATALOG_COLUMNS);

        const [view] = await sql<{ options: string[] | null }[]>`
          select c.reloptions as options from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          where c.relname = 'eccia_eventos_publicos' and c.relkind = 'v'
        `;
        assertEquals(
          [...(view?.options ?? [])].sort(),
          ["security_barrier=true", "security_invoker=false"],
        );
      },
    );

    await t.step(
      "only anon may select the view, and nobody public may write it",
      async () => {
        const rows = await sql<{ role: string; privilege: string }[]>`
          select r.role, p.privilege
          from unnest(array['anon', 'authenticated', 'public']) as r(role)
          cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                                  'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'])
            as p(privilege)
          where has_table_privilege(r.role, 'public.eccia_eventos_publicos',
                                    p.privilege)
          order by 1, 2
        `;
        assertEquals(rows.map((row) => `${row.role}:${row.privilege}`), [
          "anon:SELECT",
        ]);
      },
    );

    await sql`
      delete from public.eccia_eventos
      where masterclass_codigo in (${ACTIVE_CODE}, ${INACTIVE_CODE})
    `;
    await sql`
      insert into public.eccia_eventos
        (masterclass_codigo, event_title, codigo_prefijo, activo, tipo, resumen,
         fecha_texto, fecha_evento, duracion, nextcloud_directorio, descripcion,
         inscripcion_abre_en, inscripcion_cierra_en)
      values
        (${ACTIVE_CODE}, 'Webinar de prueba', 'PRU-ACT-', true, 'webinar',
         'Resumen público.', '5 de noviembre de 2026', '2026-11-05', '2 horas',
         'interno/carpeta', 'Texto del certificado',
         '2026-10-01T00:00:00Z', '2026-11-04T00:00:00Z'),
        (${INACTIVE_CODE}, 'Curso inactivo', 'PRU-INA-', false, 'curso',
         'No debe verse.', null, null, null, null, null, null, null)
    `;

    await t.step(
      "anon reads active events through PostgREST with only the listed columns",
      async () => {
        const response = await rest(
          `eccia_eventos_publicos?masterclass_codigo=in.(${ACTIVE_CODE},${INACTIVE_CODE})&select=*`,
        );
        assertEquals(response.status, 200);
        assertEquals(await response.json(), [{
          masterclass_codigo: ACTIVE_CODE,
          event_title: "Webinar de prueba",
          tipo: "webinar",
          resumen: "Resumen público.",
          fecha_texto: "5 de noviembre de 2026",
          fecha_evento: "2026-11-05",
          duracion: "2 horas",
          inscripcion_abre_en: "2026-10-01T00:00:00+00:00",
          inscripcion_cierra_en: "2026-11-04T00:00:00+00:00",
          requiere_ficha_inspector: false,
        }]);
      },
    );

    await t.step(
      "internal columns are not reachable through the view",
      async () => {
        const response = await rest(
          `eccia_eventos_publicos?masterclass_codigo=eq.${ACTIVE_CODE}&select=nextcloud_directorio`,
        );
        assertEquals(response.status, 400);
        assertEquals(await errorCode(response), "42703");
      },
    );

    await t.step("anon cannot read the base table", async () => {
      const response = await rest(
        `eccia_eventos?masterclass_codigo=eq.${ACTIVE_CODE}&select=masterclass_codigo`,
      );
      assertEquals(response.status, 401);
      assertEquals(await errorCode(response), "42501");
    });

    await t.step("anon cannot write through the view", async () => {
      const writes: [string, RequestInit][] = [
        ["eccia_eventos_publicos", {
          method: "POST",
          body: JSON.stringify({
            masterclass_codigo: "prueba-catalogo-intruso",
            event_title: "Intruso",
          }),
        }],
        [`eccia_eventos_publicos?masterclass_codigo=eq.${ACTIVE_CODE}`, {
          method: "PATCH",
          body: JSON.stringify({ event_title: "Alterado" }),
        }],
        [`eccia_eventos_publicos?masterclass_codigo=eq.${ACTIVE_CODE}`, {
          method: "DELETE",
        }],
      ];
      for (const [path, init] of writes) {
        const response = await rest(path, init);
        assertEquals(
          [init.method, response.status, await errorCode(response)],
          [init.method, 401, "42501"],
        );
      }
      const [row] = await sql<{ title: string }[]>`
        select event_title as title from public.eccia_eventos
        where masterclass_codigo = ${ACTIVE_CODE}
      `;
      assertEquals(row?.title, "Webinar de prueba");
    });
  } finally {
    try {
      await sql`
        delete from public.eccia_eventos
        where masterclass_codigo in (${ACTIVE_CODE}, ${INACTIVE_CODE},
                                     'prueba-catalogo-intruso')
      `;
    } finally {
      await sql.end();
    }
  }
});
