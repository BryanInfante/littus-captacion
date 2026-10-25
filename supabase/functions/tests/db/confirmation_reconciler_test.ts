import { assertEquals, postgres } from "../dev_deps.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const JOB_NAME = "eccia-reconcile-registration-confirmations";
const DISPATCH_FUNCTION = "eccia_dispatch_confirmation_reconciliation";

Deno.test("the confirmation reconciler is scheduled and dispatches to db-events", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const id = crypto.randomUUID();
  const fakeSecret = `local-only-${id}`;
  const baseUrl = `http://127.0.0.1:1/reconciler-test-${id}`;
  const rollback = new Error(`rollback-${id}`);

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

  try {
    await t.step(
      "one cron job runs the dispatch function every five minutes",
      async () => {
        const jobs = await sql<
          { schedule: string; command: string; active: boolean }[]
        >`
          select schedule, command, active from cron.job
          where jobname = ${JOB_NAME}
        `;
        assertEquals(jobs.map((job) => ({ ...job })), [{
          schedule: "*/5 * * * *",
          command: `select private.${DISPATCH_FUNCTION}()`,
          active: true,
        }]);
      },
    );

    await t.step(
      "the dispatch enqueues exactly one authenticated request to the reconcile route",
      async () => {
        await withRollback(async (tx) => {
          await tx`select ${tx(`private.${DISPATCH_FUNCTION}`)}()`;
          const queued = await tx<
            { method: string; headers: Record<string, string> }[]
          >`
            select method::text, headers from net.http_request_queue
            where url = ${`${baseUrl}/db-events/reconcile`}
          `;
          assertEquals(queued.length, 1);
          assertEquals(queued[0].method, "POST");
          assertEquals(queued[0].headers["x-eccia-webhook-secret"], fakeSecret);
        });
      },
    );

    await t.step(
      "without a configured secret the dispatch enqueues nothing",
      async () => {
        await withRollback(async (tx) => {
          await tx`delete from private.eccia_config where key = 'webhook_secret'`;
          await tx`select ${tx(`private.${DISPATCH_FUNCTION}`)}()`;
          const queued = await tx<{ id: number }[]>`
            select id from net.http_request_queue
            where url = ${`${baseUrl}/db-events/reconcile`}
          `;
          assertEquals(queued.length, 0);
        });
      },
    );

    await t.step(
      "the dispatch function runs as owner with an empty search path and closed to API roles",
      async () => {
        const [state] = await sql<{
          security_definer: boolean;
          search_path_empty: boolean;
          public_execute: boolean;
          anon: boolean;
          authenticated: boolean;
        }[]>`
          select p.prosecdef as security_definer,
                 coalesce('search_path=""' = any(p.proconfig), false) as search_path_empty,
                 has_function_privilege('public', p.oid, 'execute') as public_execute,
                 has_function_privilege('anon', p.oid, 'execute') as anon,
                 has_function_privilege('authenticated', p.oid, 'execute') as authenticated
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = ${DISPATCH_FUNCTION}
        `;
        assertEquals({ ...state }, {
          security_definer: true,
          search_path_empty: true,
          public_execute: false,
          anon: false,
          authenticated: false,
        });
      },
    );

    await t.step(
      "transaction fixtures leave no config or queue rows behind",
      async () => {
        const [leaked] = await sql<{ requests: number; config: number }[]>`
          select (select count(*)::int from net.http_request_queue
                  where url like ${`${baseUrl}/%`}) as requests,
                 (select count(*)::int from private.eccia_config
                  where value in (${baseUrl}, ${fakeSecret})) as config
        `;
        assertEquals({ ...leaked }, { requests: 0, config: 0 });
      },
    );
  } finally {
    await sql.end();
  }
});
