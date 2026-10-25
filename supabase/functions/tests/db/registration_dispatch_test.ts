import { assertEquals, postgres } from "../dev_deps.ts";
import { parseRegistrationCreated } from "../../_shared/http/registrationCreated.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const TABLE = "public.eccia_taller_inscripciones";

Deno.test("registration inserts dispatch one db-events webhook, whatever the event", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const id = crypto.randomUUID();
  const fakeSecret = `local-only-${id}`;
  const baseUrl = `http://127.0.0.1:1/dispatch-test-${id}`;
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

  const requestsTo = (tx: typeof sql, route: string) =>
    tx<{ headers: Record<string, string>; body: Uint8Array }[]>`
      select headers, body from net.http_request_queue
      where url = ${`${baseUrl}/${route}`}
    `;

  try {
    await t.step(
      "one insert enqueues exactly one authenticated request the route can parse",
      async () => {
        await withRollback(async (tx) => {
          const [registration] = await tx<{ id: string }[]>`
            insert into ${tx(TABLE)} (nombre, correo, taller_codigo)
            select 'Dispatch Probe', ${`${id}@example.invalid`}, masterclass_codigo
            from public.eccia_eventos order by masterclass_codigo limit 1
            returning id
          `;
          const queued = await requestsTo(tx, "db-events/registration-created");
          assertEquals(queued.length, 1);
          assertEquals(queued[0].headers["x-eccia-webhook-secret"], fakeSecret);
          const parsed = await parseRegistrationCreated(
            new Request("http://localhost/db-events/registration-created", {
              method: "POST",
              body: new TextDecoder().decode(queued[0].body),
            }),
          );
          assertEquals(parsed.registrationId, registration.id);
          assertEquals(
            (await requestsTo(tx, "send-registration-confirmation")).length,
            0,
            "the legacy confirmation function must no longer be called",
          );
        });
      },
    );

    await t.step(
      "the dispatch fires for an event that is not Scan A",
      async () => {
        await withRollback(async (tx) => {
          const code = `dispatch-${id}`;
          await tx`
            insert into public.eccia_eventos
              (masterclass_codigo, event_title, codigo_prefijo)
            values (${code}, 'Dispatch probe', 'ECCIA-TEST-')
          `;
          await tx`
            insert into ${tx(TABLE)} (nombre, correo, taller_codigo)
            values ('Other Event', ${`other-${id}@example.invalid`}, ${code})
          `;
          const queued = await requestsTo(tx, "db-events/registration-created");
          assertEquals(queued.length, 1);
        });
      },
    );

    await t.step(
      "registration-created has one trigger, with no per-event filter",
      async () => {
        const triggers = await sql<{ name: string; filtered: boolean }[]>`
          select t.tgname::text as name, t.tgqual is not null as filtered
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = ${TABLE}::regclass
            and not t.tgisinternal
            and p.prosrc like '%db-events/registration-created%'
        `;
        assertEquals(triggers.length, 1);
        assertEquals(triggers[0].filtered, false);

        const withFilter = await sql<{ name: string }[]>`
          select tgname::text as name from pg_trigger
          where tgrelid = ${TABLE}::regclass and not tgisinternal
            and tgqual is not null
        `;
        assertEquals(withFilter.map((r) => r.name), []);
      },
    );

    await t.step(
      "the sync-resend-contact trigger is untouched and still self-gates in its function",
      async () => {
        const triggers = await sql<{ name: string }[]>`
          select t.tgname::text as name
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = ${TABLE}::regclass and not t.tgisinternal
            and p.proname = 'eccia_sync_resend_contact'
        `;
        assertEquals(triggers.map((r) => r.name), [
          "eccia_sync_resend_contact_after_insert",
        ]);
      },
    );

    await t.step(
      "the dispatch function runs as owner with an empty search path and closed to API roles",
      async () => {
        const [state] = await sql<{
          security_definer: boolean;
          search_path_empty: boolean;
          anon: boolean;
          authenticated: boolean;
        }[]>`
          select p.prosecdef as security_definer,
                 coalesce('search_path=""' = any(p.proconfig), false) as search_path_empty,
                 has_function_privilege('anon', p.oid, 'execute') as anon,
                 has_function_privilege('authenticated', p.oid, 'execute') as authenticated
          from pg_trigger t
          join pg_proc p on p.oid = t.tgfoid
          where t.tgrelid = ${TABLE}::regclass and not t.tgisinternal
            and p.prosrc like '%db-events/registration-created%'
        `;
        assertEquals({ ...state }, {
          security_definer: true,
          search_path_empty: true,
          anon: false,
          authenticated: false,
        });
      },
    );
  } finally {
    await sql.end();
  }
});
