import { assertEquals, postgres } from "../dev_deps.ts";
import type {
  RequestLimitKey,
  RequestLimits,
} from "../../_shared/ports/requestLimits.ts";
import { MemoryRequestLimits } from "../../_shared/adapters/memory/requestLimits.ts";
import { createSupabaseRequestLimits } from "../../_shared/adapters/supabase/requestLimits.ts";
import { createRequestLimitHasher } from "../../_shared/adapters/crypto/requestLimitHash.ts";
import { localServiceRoleKey } from "../fixtures/localStack.ts";
import { NOW } from "../fixtures/registration.ts";

// Fixed local destinations and fixture-only secrets, never environment values.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_API_URL = "http://127.0.0.1:54321";
const HASH_SECRET = "fixture-request-limit-hash-secret-at-least-32-chars";
const POLICY = { limit: 3, windowSeconds: 3600 };

const randomIpv6 = (): string => {
  const hex = crypto.randomUUID().replaceAll("-", "");
  return Array.from(
    { length: 8 },
    (_, index) => hex.slice(index * 4, index * 4 + 4),
  ).join(":");
};

const fixture = async (adapter: "memory" | "postgres") => {
  let now = new Date(NOW.getTime());
  const keys: RequestLimitKey[] = [];
  if (adapter === "memory") {
    const limits: RequestLimits = new MemoryRequestLimits(() => now);
    return {
      limits,
      keys,
      expire: () => {
        now = new Date(now.getTime() + 1000);
        return Promise.resolve();
      },
      cleanup: () => Promise.resolve(),
    };
  }
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const hash = createRequestLimitHasher(HASH_SECRET);
  const cleanup = async () => {
    try {
      for (const key of keys) {
        await sql`delete from public.eccia_limites_solicitud where clave_hash = ${await hash(
          key,
        )}`;
      }
    } finally {
      await sql.end();
    }
  };
  try {
    await sql`select 1`;
    const limits: RequestLimits = createSupabaseRequestLimits({
      url: LOCAL_API_URL,
      serviceRoleKey: await localServiceRoleKey(),
      hashSecret: HASH_SECRET,
    });
    return {
      limits,
      keys,
      // A short real window proves database-owned time, not a client timestamp.
      expire: () => new Promise<void>((resolve) => setTimeout(resolve, 1100)),
      cleanup,
    };
  } catch (error) {
    await sql.end();
    throw error;
  }
};

for (const adapter of ["memory", "postgres"] as const) {
  Deno.test(`RequestLimits port contract: ${adapter}`, async (t) => {
    const { limits, keys, expire, cleanup } = await fixture(adapter);
    const email: RequestLimitKey = {
      kind: "email",
      value: `limits-${crypto.randomUUID()}@example.invalid`,
    };
    const ip: RequestLimitKey = { kind: "ip", value: randomIpv6() };
    const concurrent: RequestLimitKey = {
      kind: "email",
      value: `atomic-${crypto.randomUUID()}@example.invalid`,
    };
    keys.push(email, ip, concurrent);
    try {
      await t.step(
        "allows exactly the limit then returns positive integer retry seconds",
        async () => {
          for (let attempt = 0; attempt < POLICY.limit; attempt++) {
            assertEquals(await limits.consume(email, POLICY), {
              allowed: true,
            });
          }
          const denied = await limits.consume(email, POLICY);
          assertEquals(denied.allowed, false);
          if (denied.allowed) throw new Error("Expected exhausted limit");
          assertEquals(Number.isInteger(denied.retryAfterSeconds), true);
          assertEquals(
            denied.retryAfterSeconds > 0 && denied.retryAfterSeconds <= 3600,
            true,
          );
        },
      );
      await t.step(
        "independent keys do not consume each other's budget",
        async () => {
          assertEquals(await limits.consume(ip, POLICY), { allowed: true });
          assertEquals((await limits.consume(email, POLICY)).allowed, false);
        },
      );
      await t.step(
        "concurrent consumers cannot exceed the budget",
        async () => {
          const results = await Promise.all(
            Array.from(
              { length: 12 },
              () => limits.consume(concurrent, POLICY),
            ),
          );
          assertEquals(
            results.filter((result) => result.allowed).length,
            POLICY.limit,
          );
          assertEquals(
            results.filter((result) => !result.allowed).length,
            9,
          );
        },
      );
      await t.step("expired windows restore the complete budget", async () => {
        const shortKey: RequestLimitKey = {
          kind: "email",
          value: `expiry-${crypto.randomUUID()}@example.invalid`,
        };
        keys.push(shortKey);
        const shortWindow = { limit: 1, windowSeconds: 1 };
        assertEquals(await limits.consume(shortKey, shortWindow), {
          allowed: true,
        });
        assertEquals(
          (await limits.consume(shortKey, shortWindow)).allowed,
          false,
        );
        await expire();
        assertEquals(await limits.consume(shortKey, shortWindow), {
          allowed: true,
        });
        assertEquals(
          (await limits.consume(shortKey, shortWindow)).allowed,
          false,
        );
      });
    } finally {
      await cleanup();
    }
  });
}

Deno.test("Postgres request limits persist only keyed hashes counters and expiry, never raw email or IP", async () => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const keys: RequestLimitKey[] = [
    { kind: "email", value: `private-${crypto.randomUUID()}@example.invalid` },
    { kind: "ip", value: randomIpv6() },
  ];
  const hash = createRequestLimitHasher(HASH_SECRET);
  try {
    const limits = createSupabaseRequestLimits({
      url: LOCAL_API_URL,
      serviceRoleKey: await localServiceRoleKey(),
      hashSecret: HASH_SECRET,
    });
    const columns = await sql<{ name: string }[]>`
      select column_name as name from information_schema.columns
      where table_schema = 'public' and table_name = 'eccia_limites_solicitud'
      order by column_name
    `;
    assertEquals(columns.map((row) => row.name), [
      "clave_hash",
      "intentos",
      "vence_en",
    ]);
    for (const key of keys) {
      assertEquals(await limits.consume(key, POLICY), { allowed: true });
      const digest = await hash(key);
      const rows = await sql<
        { clave_hash: string; intentos: number; finite_expiry: boolean }[]
      >`
        select clave_hash, intentos, (vence_en > clock_timestamp()
          and vence_en <= clock_timestamp() + interval '1 hour') as finite_expiry
        from public.eccia_limites_solicitud where clave_hash = ${digest}
      `;
      assertEquals(rows.map((row) => ({ ...row })), [{
        clave_hash: digest,
        intentos: 1,
        finite_expiry: true,
      }]);
      const serialized = JSON.stringify(rows);
      assertEquals(serialized.includes(key.value), false);
      assertEquals(serialized.includes(HASH_SECRET), false);
    }
  } finally {
    try {
      for (const key of keys) {
        await sql`delete from public.eccia_limites_solicitud where clave_hash = ${await hash(
          key,
        )}`;
      }
    } finally {
      await sql.end();
    }
  }
});

Deno.test("request limit RPC is service-role only and API roles cannot read its table", async () => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{
      role: string;
      execute: boolean;
      read_table: boolean;
      read_column: boolean;
    }[]>`
      select r.role,
        has_function_privilege(r.role,
          'public.eccia_consumir_limite(text,integer,integer)', 'execute') as execute,
        has_table_privilege(r.role, 'public.eccia_limites_solicitud', 'select') as read_table,
        has_any_column_privilege(r.role, 'public.eccia_limites_solicitud', 'select') as read_column
      from unnest(array['anon', 'authenticated', 'service_role']) r(role)
      order by r.role
    `;
    assertEquals(
      rows.filter((row) => row.role !== "service_role").map((row) => ({
        ...row,
      })),
      [
        { role: "anon", execute: false, read_table: false, read_column: false },
        {
          role: "authenticated",
          execute: false,
          read_table: false,
          read_column: false,
        },
      ],
    );
    assertEquals(
      rows.filter((row) => row.role === "service_role").map((row) =>
        row.execute
      ),
      [true],
    );
    const functions = await sql<
      {
        security_definer: boolean;
        empty_path: boolean;
        public_execute: boolean;
      }[]
    >`
      select p.prosecdef as security_definer,
        coalesce('search_path=""' = any(p.proconfig), false) as empty_path,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
      from pg_proc p
      where p.oid = 'public.eccia_consumir_limite(text,integer,integer)'::regprocedure
    `;
    assertEquals(functions.map((row) => ({ ...row })), [{
      security_definer: true,
      empty_path: true,
      public_execute: false,
    }]);
  } finally {
    await sql.end();
  }
});

Deno.test("request limit consumption removes expired keyed rows instead of retaining identifiers indefinitely", async () => {
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const hash = createRequestLimitHasher(HASH_SECRET);
  const staleKey: RequestLimitKey = {
    kind: "email",
    value: `stale-${crypto.randomUUID()}@example.invalid`,
  };
  const freshKey: RequestLimitKey = {
    kind: "email",
    value: `fresh-${crypto.randomUUID()}@example.invalid`,
  };
  const staleHash = await hash(staleKey);
  const freshHash = await hash(freshKey);
  try {
    await sql`insert into public.eccia_limites_solicitud (clave_hash, intentos, vence_en)
              values (${staleHash}, 1, clock_timestamp() - interval '1 second')`;
    const limits = createSupabaseRequestLimits({
      url: LOCAL_API_URL,
      serviceRoleKey: await localServiceRoleKey(),
      hashSecret: HASH_SECRET,
    });
    assertEquals(await limits.consume(freshKey, POLICY), { allowed: true });
    const rows = await sql<{ clave_hash: string }[]>`
      select clave_hash from public.eccia_limites_solicitud where clave_hash = ${staleHash}
    `;
    assertEquals(rows.length, 0);
  } finally {
    try {
      await sql`delete from public.eccia_limites_solicitud where clave_hash in (${staleHash}, ${freshHash})`;
    } finally {
      await sql.end();
    }
  }
});
