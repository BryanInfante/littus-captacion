import { assertEquals, postgres } from "../dev_deps.ts";

// `supabase start` always serves the local database here (supabase/config.toml
// keeps the default [db] port). It is a constant on purpose: this suite cannot
// be pointed at the remote project by an environment variable.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// DU-02 closes every public write, including registrations. Keep the empty
// allow-list explicit so a future exception cannot silently reopen access.
const REGISTRATION_INSERT_COLUMNS: Readonly<Record<string, readonly string[]>> =
  {};

const isAllowedInsert = (table: string, column: string): boolean =>
  REGISTRATION_INSERT_COLUMNS[table]?.includes(column) ?? false;

// has_*_privilege answers "can this role do it", which covers grants made by
// any owner, to PUBLIC, and at column level (pg_attribute.attacl), not only the
// grants visible in relacl or to the connecting role.
Deno.test("public roles cannot read or write base tables in schema public", async (t) => {
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
      "allow-listed registration tables and columns exist",
      async () => {
        const rows = await sql<{ table_name: string; column_name: string }[]>`
        select c.relname as table_name, a.attname as column_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where c.relkind in ('r', 'p')
      `;
        const existing = new Set(
          rows.map((r) => `${r.table_name}.${r.column_name}`),
        );
        const missing = Object.entries(REGISTRATION_INSERT_COLUMNS)
          .flatMap(([table, columns]) =>
            columns.map((column) => `${table}.${column}`)
          )
          .filter((entry) => !existing.has(entry));
        assertEquals(missing, [], "stale registration allow-list entries");
      },
    );

    await t.step(
      "no table-level privilege for anon or authenticated",
      async () => {
        const rows = await sql<
          { table_name: string; role: string; privilege: string }[]
        >`
        select c.relname as table_name, r.role, p.privilege
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        cross join unnest(array['anon', 'authenticated']) as r(role)
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                                'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
        where c.relkind in ('r', 'p')
          and has_table_privilege(r.role, c.oid, p.privilege)
        order by 1, 2, 3
      `;
        const violations = rows.map((r) =>
          `${r.table_name}: ${r.role} has ${r.privilege}`
        );
        assertEquals(
          violations,
          [],
          "public roles hold table-level privileges",
        );
      },
    );

    await t.step(
      "column privileges limited to the registration insert allow-list",
      async () => {
        const rows = await sql<
          {
            table_name: string;
            column_name: string;
            role: string;
            privilege: string;
          }[]
        >`
        select c.relname as table_name, a.attname as column_name, r.role, p.privilege
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        cross join unnest(array['anon', 'authenticated']) as r(role)
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p(privilege)
        where c.relkind in ('r', 'p')
          and has_column_privilege(r.role, c.oid, a.attnum, p.privilege)
        order by 1, 2, 3, 4
      `;
        const violations = rows
          .filter((r) =>
            !(r.privilege === "INSERT" &&
              isAllowedInsert(r.table_name, r.column_name))
          )
          .map((r) =>
            `${r.table_name}.${r.column_name}: ${r.role} has ${r.privilege}`
          );
        assertEquals(
          violations,
          [],
          "public roles hold column privileges outside the allow-list",
        );
      },
    );

    await t.step(
      "no policies target public roles",
      async () => {
        const rows = await sql<
          {
            table_name: string;
            policy_name: string;
            command: string;
            roles: string[];
          }[]
        >`
        select tablename as table_name, policyname as policy_name, cmd as command,
               roles::text[] as roles
        from pg_policies
        where schemaname = 'public'
          and roles && array['anon', 'authenticated', 'public']::name[]
        order by 1, 2
      `;
        const violations = rows.map((r) =>
          `${r.table_name}: policy "${r.policy_name}" (${r.command}) targets ${
            r.roles.join(", ")
          }`
        );
        assertEquals(
          violations,
          [],
          "policies target public roles",
        );
      },
    );

    await t.step(
      "tables created by postgres in public are born closed",
      async () => {
        const rows = await sql<
          { scope: string; grantee: string; privilege: string }[]
        >`
        select coalesce(n.nspname, 'all schemas') as scope,
               coalesce(g.rolname, 'PUBLIC') as grantee,
               a.privilege_type as privilege
        from pg_default_acl d
        join pg_roles o on o.oid = d.defaclrole and o.rolname = 'postgres'
        left join pg_namespace n on n.oid = d.defaclnamespace
        cross join aclexplode(d.defaclacl) a
        left join pg_roles g on g.oid = a.grantee
        where d.defaclobjtype = 'r'
          and (n.nspname = 'public' or d.defaclnamespace = 0)
          and coalesce(g.rolname, 'PUBLIC') in ('anon', 'authenticated', 'PUBLIC')
        order by 1, 2, 3
      `;
        const violations = rows.map((r) =>
          `default privileges of postgres (${r.scope}): ${r.grantee} gets ${r.privilege} on new tables`
        );
        assertEquals(
          violations,
          [],
          "new tables would be born open to public roles",
        );
      },
    );
  } finally {
    await sql.end();
  }
});
