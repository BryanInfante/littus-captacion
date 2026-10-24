import { localServiceRoleKey } from "../fixtures/localStack.ts";
import { assertEquals, assertRejects, postgres } from "../dev_deps.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import type { Events } from "../../_shared/ports/events.ts";
import type { Registrations } from "../../_shared/ports/registrations.ts";
import { createSupabasePorts } from "../../_shared/adapters/supabase/registrationPorts.ts";
import { memoryPorts, openEvent } from "../fixtures/registration.ts";

// Fixed local destinations, never an environment-supplied project or key.
const LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_API_URL = "http://127.0.0.1:54321";

type Fixture = {
  events: Events;
  registrations: Registrations;
  firstCode: string;
  secondCode: string;
  cleanup: () => Promise<void>;
};

const fixture = async (adapter: "memory" | "supabase"): Promise<Fixture> => {
  const firstCode = `contract-${crypto.randomUUID()}`;
  const secondCode = `contract-${crypto.randomUUID()}`;
  const seed = [
    openEvent({ code: firstCode }),
    openEvent({
      code: secondCode,
      active: false,
      registrationOpensAt: null,
      registrationClosesAt: null,
    }),
  ];
  if (adapter === "memory") {
    return {
      ...memoryPorts(seed),
      firstCode,
      secondCode,
      cleanup: () => Promise.resolve(),
    };
  }
  const sql = postgres(LOCAL_DATABASE_URL, { max: 1, onnotice: () => {} });
  const cleanup = async () => {
    try {
      await sql`delete from public.eccia_taller_inscripciones where taller_codigo in (${firstCode}, ${secondCode})`;
      await sql`delete from public.eccia_eventos where masterclass_codigo in (${firstCode}, ${secondCode})`;
    } finally {
      await sql.end();
    }
  };
  try {
    try {
      await sql`select 1`;
    } catch (error) {
      throw new Error(
        "Local Supabase stack is not reachable at 127.0.0.1:54322; run `supabase start`.",
        { cause: error },
      );
    }
    // Refuse inserts if the local stack could dispatch external webhooks.
    const dispatch = await sql<{ configured: boolean }[]>`
      select (
        exists (select 1 from private.eccia_config
                where key = 'functions_base_url' and btrim(value) <> '')
        or coalesce(current_setting('app.eccia_functions_base_url', true), '') <> ''
        or exists (select 1 from pg_db_role_setting s,
                   unnest(s.setconfig) setting
                   where setting like 'app.eccia_functions_base_url=%'
                     and setting <> 'app.eccia_functions_base_url=')
      ) as configured
    `;
    assertEquals(
      dispatch.map((row) => row.configured),
      [false],
      "Use an isolated local stack with webhook dispatch unconfigured",
    );
    for (const event of seed) {
      await sql`
        insert into public.eccia_eventos
          (masterclass_codigo, event_title, codigo_prefijo, activo,
           inscripcion_abre_en, inscripcion_cierra_en)
        values (${event.code}, 'Port contract fixture', 'ECCIA-TEST-', ${event.active},
                ${event.registrationOpensAt}, ${event.registrationClosesAt})
      `;
    }
    return {
      ...createSupabasePorts({
        url: LOCAL_API_URL,
        serviceRoleKey: await localServiceRoleKey(),
      }),
      firstCode,
      secondCode,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
};

// The exact same assertions exercise both implementations, including direct
// create calls: SQLSTATE mapping belongs to the adapter, not just the use case.
for (const adapter of ["memory", "supabase"] as const) {
  Deno.test(`Events and Registrations port contract: ${adapter}`, async (t) => {
    const { events, registrations, firstCode, secondCode, cleanup } =
      await fixture(adapter);
    try {
      await t.step(
        "Events finds by code and maps registration windows",
        async () => {
          assertEquals(
            await events.findByCode(firstCode),
            openEvent({ code: firstCode }),
          );
          assertEquals(
            await events.findByCode(secondCode),
            openEvent({
              code: secondCode,
              active: false,
              registrationOpensAt: null,
              registrationClosesAt: null,
            }),
          );
        },
      );
      await t.step("Events returns null for an unknown event", async () => {
        assertEquals(await events.findByCode("unknown-contract-event"), null);
      });
      await t.step(
        "Registrations creates normalized email and preserves consent",
        async () => {
          const created = await registrations.create({
            eventCode: firstCode,
            name: "Port Test Person",
            email: Email.parse(" CONTRACT@Example.Invalid "),
            marketingConsent: true,
          });
          assertEquals(typeof created.id, "string");
          assertEquals(created.id.length > 0, true);
          assertEquals(created.eventCode, firstCode);
          assertEquals(created.name, "Port Test Person");
          assertEquals(created.email.value, "contract@example.invalid");
          assertEquals(created.marketingConsent, true);
        },
      );
      await t.step(
        "Registrations maps normalized duplicate to already registered",
        async () => {
          const input = {
            eventCode: firstCode,
            name: "Duplicate Probe",
            email: Email.parse(" DUPLICATE@Example.Invalid "),
            marketingConsent: false,
          };
          await registrations.create(input);
          const error = await assertRejects(
            () =>
              registrations.create({
                ...input,
                email: Email.parse("duplicate@example.invalid"),
              }),
            DomainError,
          );
          if (!(error instanceof DomainError)) {
            throw new Error("Expected DomainError", { cause: error });
          }
          assertEquals(error.code, "ALREADY_REGISTERED");
        },
      );
      await t.step(
        "Registrations permits the same email for another event",
        async () => {
          const input = {
            name: "Cross Event Probe",
            email: Email.parse("cross@example.invalid"),
            marketingConsent: false,
          };
          const first = await registrations.create({
            ...input,
            eventCode: firstCode,
          });
          const second = await registrations.create({
            ...input,
            eventCode: secondCode,
          });
          assertEquals(first.id === second.id, false);
          assertEquals(second.eventCode, secondCode);
          assertEquals(second.marketingConsent, false);
        },
      );
      await t.step(
        "Registrations maps an unknown event foreign key to event not found",
        async () => {
          const error = await assertRejects(() =>
            registrations.create({
              eventCode: "unknown-contract-event",
              name: "Foreign Key Probe",
              email: Email.parse("fk@example.invalid"),
              marketingConsent: false,
            }), DomainError);
          if (!(error instanceof DomainError)) {
            throw new Error("Expected DomainError", { cause: error });
          }
          assertEquals(error.code, "EVENT_NOT_FOUND");
        },
      );
    } finally {
      await cleanup();
    }
  });
}
