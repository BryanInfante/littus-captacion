import { assertEquals, postgres } from "../dev_deps.ts";

// Intentionally fixed to the local stack; never accept a remote URL from env.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Functions that fire from triggers on public tables run as their owner, so the
// inserting role (service_role) needs no access to schema private. They must
// keep an empty search_path and stay out of reach of the API roles.
Deno.test("trigger functions in private run as owner and are closed to API roles", async () => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<
      {
        name: string;
        security_definer: boolean;
        search_path_empty: boolean;
        anon: boolean;
        authenticated: boolean;
      }[]
    >`
      select distinct p.proname::text as name,
             p.prosecdef as security_definer,
             coalesce('search_path=""' = any(p.proconfig), false) as search_path_empty,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace table_ns on table_ns.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace fn_ns on fn_ns.oid = p.pronamespace
      where not t.tgisinternal
        and table_ns.nspname = 'public'
        and fn_ns.nspname = 'private'
      order by 1
    `;
    const violations = rows.flatMap((row) => [
      ...(row.security_definer ? [] : [`${row.name} runs as the invoker`]),
      ...(row.search_path_empty
        ? []
        : [`${row.name} has a non-empty search_path`]),
      ...(row.anon ? [`${row.name} is executable by anon`] : []),
      ...(row.authenticated
        ? [`${row.name} is executable by authenticated`]
        : []),
    ]);
    assertEquals(
      violations,
      [],
      "private trigger functions must run as owner and be closed to API roles",
    );
  } finally {
    await sql.end();
  }
});
