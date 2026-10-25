import { assertEquals, postgres } from "../dev_deps.ts";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const NEW_EVENT_COLUMNS = [
  "aula_url",
  "comunidad_url",
  "horario_texto",
  "incluye_texto",
  "modalidad_texto",
  "transmision_url",
];

Deno.test("event confirmation content stays private and only accepts HTTPS links", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await t.step(
      "the public catalog view exposes none of the new columns",
      async () => {
        const rows = await sql<{ column_name: string }[]>`
          select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'eccia_eventos_publicos'
        `;
        const exposed = rows.map((row) => row.column_name);
        for (const column of NEW_EVENT_COLUMNS) {
          assertEquals(exposed.includes(column), false, column);
        }
      },
    );
    await t.step("non-HTTPS links and blank text are rejected", async () => {
      const code = `confirmation-content-${crypto.randomUUID()}`;
      const rejected: Record<string, string> = {
        comunidad_url: "http://community.example.invalid/",
        transmision_url: "javascript:alert(1)",
        aula_url: "https://has space.example.invalid/",
        horario_texto: "   ",
        modalidad_texto: "x".repeat(121),
      };
      for (const [column, value] of Object.entries(rejected)) {
        let sqlState: string | undefined;
        try {
          await sql`
            insert into public.eccia_eventos
              (masterclass_codigo, event_title, codigo_prefijo, ${sql(column)})
            values (${code}, 'Content constraint probe', 'ECCIA-TEST-', ${value})
          `;
        } catch (error) {
          sqlState = (error as { code?: string }).code;
        }
        assertEquals(sqlState, "23514", column);
      }
      const leftovers =
        await sql`select 1 from public.eccia_eventos where masterclass_codigo = ${code}`;
      assertEquals(leftovers.length, 0);
    });
    await t.step("attempt bookkeeping rejects negative counts", async () => {
      let sqlState: string | undefined;
      try {
        // The failing statement aborts the transaction, so nothing persists.
        await sql.begin(async (transaction) => {
          await transaction`
            insert into public.eccia_eventos
              (masterclass_codigo, event_title, codigo_prefijo)
            values ('attempts-probe', 'Attempts probe', 'ECCIA-TEST-')
          `;
          await transaction`
            insert into public.eccia_taller_inscripciones
              (nombre, correo, taller_codigo, confirmation_attempts)
            values ('Attempts Probe', 'attempts@example.invalid', 'attempts-probe', -1)
          `;
        });
      } catch (error) {
        sqlState = (error as { code?: string }).code;
      }
      assertEquals(sqlState, "23514");
    });
  } finally {
    await sql.end();
  }
});
