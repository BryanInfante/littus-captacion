import { assertEquals, postgres } from "../dev_deps.ts";

const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const rollbackSentinel = () => new Error(`rollback-${crypto.randomUUID()}`);

Deno.test("database webhook dispatch requires its configured shared secret", async (t) => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const id = crypto.randomUUID();
  const fakeSecret = `local-only-${id}`;
  const baseUrl = `http://127.0.0.1:1/webhook-test-${id}`;

  const withRollback = async (
    assertInTransaction: (tx: typeof sql) => Promise<void>,
  ) => {
    const sentinel = rollbackSentinel();
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into private.eccia_config (key, value)
          values ('functions_base_url', ${baseUrl})
          on conflict (key) do update set value = excluded.value
        `;
        await assertInTransaction(tx as unknown as typeof sql);
        throw sentinel;
      });
    } catch (error) {
      if (error !== sentinel) throw error;
    }
  };

  try {
    await t.step(
      "missing secret does not enqueue an unauthenticated request",
      async () => {
        await withRollback(async (tx) => {
          await tx`delete from private.eccia_config where key = 'webhook_secret'`;
          await tx`
          select private.eccia_post_to_edge_function(
            'local-test', ${id}::uuid, 'fixture', 'public'
          )
        `;
          const requests = await tx<{ id: number }[]>`
          select id from net.http_request_queue
          where url = ${`${baseUrl}/local-test`}
        `;
          assertEquals(requests.length, 0);
        });
      },
    );

    await t.step(
      "blank secret does not enqueue an unauthenticated request",
      async () => {
        await withRollback(async (tx) => {
          await tx`
          insert into private.eccia_config (key, value)
          values ('webhook_secret', E' \t\n ')
          on conflict (key) do update set value = excluded.value
        `;
          await tx`
          select private.eccia_post_to_edge_function(
            'local-test', ${id}::uuid, 'fixture', 'public'
          )
        `;
          const requests = await tx<{ id: number }[]>`
          select id from net.http_request_queue
          where url = ${`${baseUrl}/local-test`}
        `;
          assertEquals(requests.length, 0);
        });
      },
    );

    await t.step(
      "configured secret is sent with the unchanged request contract",
      async () => {
        await withRollback(async (tx) => {
          await tx`
          insert into private.eccia_config (key, value)
          values ('webhook_secret', ${`  ${fakeSecret}  `})
          on conflict (key) do update set value = excluded.value
        `;
          await tx`
          select private.eccia_post_to_edge_function(
            'local-test', ${id}::uuid, 'fixture', 'public'
          )
        `;
          const requests = await tx<{
            method: string;
            url: string;
            headers: Record<string, string>;
            body: Uint8Array;
            timeout_milliseconds: number;
          }[]>`
          select method::text, url, headers, body, timeout_milliseconds
          from net.http_request_queue
          where url = ${`${baseUrl}/local-test`}
        `;
          assertEquals(requests.length, 1);
          const request = requests[0];
          assertEquals(request.method, "POST");
          assertEquals(request.url, `${baseUrl}/local-test`);
          assertEquals(request.headers, {
            "Content-Type": "application/json",
            "x-eccia-webhook-secret": fakeSecret,
          });
          assertEquals(JSON.parse(new TextDecoder().decode(request.body)), {
            type: "INSERT",
            table: "fixture",
            schema: "public",
            record: { id },
          });
          assertEquals(request.timeout_milliseconds, 5000);
        });
      },
    );

    await t.step(
      "function retains definer, empty search path, and API revocations",
      async () => {
        const [functionState] = await sql<{
          security_definer: boolean;
          search_path_empty: boolean;
          public_execute: boolean;
          anon_execute: boolean;
          authenticated_execute: boolean;
        }[]>`
        select p.prosecdef as security_definer,
               coalesce('search_path=""' = any(p.proconfig), false) as search_path_empty,
               has_function_privilege('public', p.oid, 'execute') as public_execute,
               has_function_privilege('anon', p.oid, 'execute') as anon_execute,
               has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname = 'eccia_post_to_edge_function'
          and pg_get_function_identity_arguments(p.oid) =
            'function_slug text, record_id uuid, table_name text, schema_name text'
      `;
        assertEquals(functionState, {
          security_definer: true,
          search_path_empty: true,
          public_execute: false,
          anon_execute: false,
          authenticated_execute: false,
        });
      },
    );

    await t.step(
      "transaction fixtures leave no config or queue rows behind",
      async () => {
        const leakedConfig = await sql<{ count: number }[]>`
        select count(*)::int as count from private.eccia_config
        where value in (${baseUrl}, ${" \t\n "}, ${`  ${fakeSecret}  `})
      `;
        const leakedRequests = await sql<{ count: number }[]>`
        select count(*)::int as count from net.http_request_queue
        where url like ${`${baseUrl}/%`}
      `;
        assertEquals(leakedConfig[0].count, 0);
        assertEquals(leakedRequests[0].count, 0);
      },
    );
  } finally {
    await sql.end();
  }
});
