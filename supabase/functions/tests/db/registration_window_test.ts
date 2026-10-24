import { assertEquals, postgres } from "../dev_deps.ts";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

Deno.test("event registration window migration preserves closed defaults and enforces ordering", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await t.step(
      "window columns are nullable timestamptz without defaults",
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
          and column_name in ('inscripcion_abre_en', 'inscripcion_cierra_en')
        order by column_name
      `;
        assertEquals(rows.map((row) => ({ ...row })), [
          {
            column_name: "inscripcion_abre_en",
            data_type: "timestamp with time zone",
            is_nullable: "YES",
            column_default: null,
          },
          {
            column_name: "inscripcion_cierra_en",
            data_type: "timestamp with time zone",
            is_nullable: "YES",
            column_default: null,
          },
        ]);
      },
    );
    await t.step(
      "existing seeded events remain closed with null windows",
      async () => {
        const rows = await sql<
          { code: string; opens: Date | null; closes: Date | null }[]
        >`
        select masterclass_codigo as code, inscripcion_abre_en as opens,
               inscripcion_cierra_en as closes
        from public.eccia_eventos
        where masterclass_codigo in
          ('ultrasonido-industrial-scan-a', 'preparador-muestras-metalograficas')
        order by masterclass_codigo
      `;
        assertEquals(rows.map((row) => ({ ...row })), [
          {
            code: "preparador-muestras-metalograficas",
            opens: null,
            closes: null,
          },
          { code: "ultrasonido-industrial-scan-a", opens: null, closes: null },
        ]);
      },
    );
    await t.step(
      "window check is validated and covers both columns",
      async () => {
        const rows = await sql<{ convalidated: boolean }[]>`
        select c.convalidated from pg_constraint c
        where c.conrelid = 'public.eccia_eventos'::regclass and c.contype = 'c'
          and array(select a.attname::text from unnest(c.conkey) k(num)
                    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
                    order by a.attname)
              = array['inscripcion_abre_en', 'inscripcion_cierra_en']::text[]
      `;
        assertEquals(rows.map((row) => row.convalidated), [true]);
      },
    );
    await t.step(
      "window check accepts null boundaries and strictly increasing timestamps",
      async () => {
        const rollback = new Error("Rollback window fixtures");
        try {
          await sql.begin(async (tx) => {
            for (
              const [opens, closes] of [
                [null, null],
                ["2026-10-20T12:00:00Z", null],
                [null, "2026-10-20T13:00:00Z"],
                ["2026-10-20T12:00:00Z", "2026-10-20T12:00:00.001Z"],
              ]
            ) {
              await tx`
              insert into public.eccia_eventos
                (masterclass_codigo, event_title, codigo_prefijo, inscripcion_abre_en, inscripcion_cierra_en)
              values (${`window-${crypto.randomUUID()}`}, 'Window fixture', 'ECCIA-TEST-', ${opens}, ${closes})
            `;
            }
            throw rollback;
          });
        } catch (error) {
          if (error !== rollback) throw error;
        }
      },
    );
    await t.step(
      "window check rejects equal and reversed timestamps",
      async () => {
        for (
          const closes of ["2026-10-20T12:00:00Z", "2026-10-20T11:59:59.999Z"]
        ) {
          const rollback = new Error("Rollback invalid window probe");
          let code: string | undefined;
          try {
            await sql.begin(async (tx) => {
              try {
                await tx`
                insert into public.eccia_eventos
                  (masterclass_codigo, event_title, codigo_prefijo, inscripcion_abre_en, inscripcion_cierra_en)
                values (${`window-${crypto.randomUUID()}`}, 'Invalid window fixture', 'ECCIA-TEST-',
                        '2026-10-20T12:00:00Z', ${closes})
              `;
              } catch (error) {
                if (!(error instanceof postgres.PostgresError)) throw error;
                code = error.code;
              }
              throw rollback;
            });
          } catch (error) {
            if (error !== rollback) throw error;
          }
          assertEquals(
            code,
            "23514",
            "Expected check_violation for a non-increasing window",
          );
        }
      },
    );
  } finally {
    await sql.end();
  }
});
