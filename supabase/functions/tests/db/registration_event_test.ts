import { assertEquals, postgres } from "../dev_deps.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

Deno.test("registrations reference canonical event rows", async (t) => {
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

    await t.step("event foreign key exists and is validated", async () => {
      const rows = await sql<
        {
          convalidated: boolean;
          source_columns: string[];
          target_schema: string;
          target_table: string;
          target_columns: string[];
        }[]
      >`
        select c.convalidated,
               array(select a.attname::text
                     from unnest(c.conkey) with ordinality k(num, position)
                     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
                     order by k.position) as source_columns,
               n.nspname as target_schema, target.relname as target_table,
               array(select a.attname::text
                     from unnest(c.confkey) with ordinality k(num, position)
                     join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num
                     order by k.position) as target_columns
        from pg_constraint c
        join pg_class target on target.oid = c.confrelid
        join pg_namespace n on n.oid = target.relnamespace
        where c.conrelid = 'public.eccia_taller_inscripciones'::regclass
          and c.conname = 'eccia_taller_inscripciones_evento_fkey'
          and c.contype = 'f'
      `;
      assertEquals(
        rows.map((r) => ({ ...r })),
        [{
          convalidated: true,
          source_columns: ["taller_codigo"],
          target_schema: "public",
          target_table: "eccia_eventos",
          target_columns: ["masterclass_codigo"],
        }],
        "registration event FK must exist, be validated, and target the event key",
      );
    });

    await t.step("event code has no default", async () => {
      const rows = await sql<{ column_default: string | null }[]>`
        select column_default
        from information_schema.columns
        where table_schema = 'public' and table_name = 'eccia_taller_inscripciones'
          and column_name = 'taller_codigo'
      `;
      assertEquals(
        rows.map((r) => r.column_default),
        [null],
        "registration event code must have no default",
      );
    });

    await t.step("past END events preserve unknown metadata", async () => {
      const rows = await sql<
        {
          masterclass_codigo: string;
          activo: boolean;
          unknown_metadata: boolean;
          no_certificate_prefix: boolean;
        }[]
      >`
        select e.masterclass_codigo, e.activo,
               (e.fecha_evento is null and e.fecha_texto is null and e.duracion is null)
                 as unknown_metadata,
               -- certgen issues END course certificates with its own
               -- numbering, so this system holds no certificate prefix.
               (e.codigo_prefijo is null) as no_certificate_prefix
        from public.eccia_eventos e
        where e.masterclass_codigo in ('end-vt-pt-mt-2026-09', 'end-vt-ii-pt-ii-ut-i-2026-10')
        order by e.masterclass_codigo
      `;
      assertEquals(
        rows.map((r) => ({ ...r })),
        [
          {
            masterclass_codigo: "end-vt-ii-pt-ii-ut-i-2026-10",
            activo: false,
            unknown_metadata: true,
            no_certificate_prefix: true,
          },
          {
            masterclass_codigo: "end-vt-pt-mt-2026-09",
            activo: false,
            unknown_metadata: true,
            no_certificate_prefix: true,
          },
        ],
        "past END events must exist, be inactive, and preserve unknown metadata",
      );
    });

    await t.step("legacy Scan A code has no registrations", async () => {
      const rows = await sql<{ legacy_count: number }[]>`
        select count(*)::integer as legacy_count
        from public.eccia_taller_inscripciones
        where taller_codigo = 'domina-scan-a'
      `;
      assertEquals(
        rows.map((r) => r.legacy_count),
        [0],
        "legacy Scan A registrations must be migrated",
      );
    });

    await t.step("service role cannot insert an unknown event", async () => {
      const rollback = new Error("Roll back the FK probe even if it succeeds");
      try {
        await sql.begin(async (tx) => {
          await tx`set local role service_role`;
          let code: string | undefined;
          let constraint: string | undefined;
          try {
            await tx`
              insert into public.eccia_taller_inscripciones (nombre, correo, taller_codigo)
              values ('FK probe', ${`${crypto.randomUUID()}@example.invalid`},
                      'unknown-event-fk-probe')
            `;
          } catch (error) {
            if (!(error instanceof postgres.PostgresError)) throw error;
            code = error.code;
            constraint = error.constraint_name;
          }
          assertEquals(
            code,
            "23503",
            "unknown event must raise foreign_key_violation",
          );
          assertEquals(
            constraint,
            "eccia_taller_inscripciones_evento_fkey",
            "unknown event must fail the registration event FK",
          );
          // Throwing makes postgres.js roll back, including an unexpected insert.
          throw rollback;
        });
      } catch (error) {
        if (error !== rollback) throw error;
      }
    });
  } finally {
    await sql.end();
  }
});
