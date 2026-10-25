import { localServiceRoleKey } from "../fixtures/localStack.ts";
import { assertEquals, assertRejects, postgres } from "../dev_deps.ts";
import { Email } from "../../_shared/domain/email.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import type { Events } from "../../_shared/ports/events.ts";
import type { Registrations } from "../../_shared/ports/registrations.ts";
import { createSupabasePorts } from "../../_shared/adapters/supabase/registrationPorts.ts";
import { memoryPorts, openEvent } from "../fixtures/registration.ts";
import type { EventContent } from "../../_shared/domain/event.ts";
import {
  CONFIRMATION_MAX_ATTEMPTS,
  CONFIRMATION_RETRY_AFTER_MS,
  CONFIRMATION_RETRY_WINDOW_MS,
  confirmationFailed,
  confirmationSucceeded,
  INITIAL_CONFIRMATION,
} from "../../_shared/domain/confirmation.ts";

const CONFIRMATION_RETRY_AFTER_MINUTES = CONFIRMATION_RETRY_AFTER_MS / 60000;

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

// Event copy that the confirmation email renders; the second event leaves every
// optional field empty to prove nulls round-trip.
const contentFor = (code: string, full: boolean): EventContent => ({
  code,
  title: "Port contract fixture",
  kind: full ? "curso" : null,
  dateText: full ? "Del 1 al 2 de enero" : null,
  durationText: full ? "8 horas" : null,
  scheduleText: full ? "10h00 a 12h00" : null,
  modalityText: full ? "Online" : null,
  includesText: full ? "Certificado" : null,
  communityUrl: full ? "https://community.example.invalid/x" : null,
  streamUrl: full ? "https://stream.example.invalid/x" : null,
  classroomUrl: full ? "https://classroom.example.invalid/" : null,
  nextStepsText: full ? "Recibirás tu acceso al aula en breve." : null,
});

const fixture = async (adapter: "memory" | "supabase"): Promise<Fixture> => {
  const firstCode = `contract-${crypto.randomUUID()}`;
  const secondCode = `contract-${crypto.randomUUID()}`;
  const seed = [
    openEvent({ code: firstCode, requiresInspectorProfile: true }),
    openEvent({
      code: secondCode,
      active: false,
      registrationOpensAt: null,
      registrationClosesAt: null,
      requiresInspectorProfile: false,
    }),
  ];
  if (adapter === "memory") {
    return {
      ...memoryPorts(seed, [
        contentFor(firstCode, true),
        contentFor(secondCode, false),
      ]),
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
      const content = contentFor(event.code, event.code === firstCode);
      await sql`
        insert into public.eccia_eventos
          (masterclass_codigo, event_title, codigo_prefijo, activo,
           inscripcion_abre_en, inscripcion_cierra_en, requiere_ficha_inspector,
           tipo, fecha_texto, duracion, horario_texto, modalidad_texto,
           incluye_texto, comunidad_url, transmision_url, aula_url,
           siguientes_pasos_texto)
        values (${event.code}, ${content.title}, 'ECCIA-TEST-', ${event.active},
                ${event.registrationOpensAt}, ${event.registrationClosesAt}, ${
        event.requiresInspectorProfile ?? false
      },
                ${content.kind}, ${content.dateText}, ${content.durationText},
                ${content.scheduleText}, ${content.modalityText},
                ${content.includesText}, ${content.communityUrl},
                ${content.streamUrl}, ${content.classroomUrl},
                ${content.nextStepsText})
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
            openEvent({ code: firstCode, requiresInspectorProfile: true }),
          );
          assertEquals(
            await events.findByCode(secondCode),
            openEvent({
              code: secondCode,
              active: false,
              registrationOpensAt: null,
              registrationClosesAt: null,
              requiresInspectorProfile: false,
            }),
          );
        },
      );
      await t.step("Events returns null for an unknown event", async () => {
        assertEquals(await events.findByCode("unknown-contract-event"), null);
      });
      await t.step(
        "Events returns confirmation content, with empty fields as null",
        async () => {
          assertEquals(
            await events.findContentByCode(firstCode),
            contentFor(firstCode, true),
          );
          assertEquals(
            await events.findContentByCode(secondCode),
            contentFor(secondCode, false),
          );
          assertEquals(
            await events.findContentByCode("unknown-contract-event"),
            null,
          );
        },
      );
      await t.step(
        "Registrations persists confirmation state and never overwrites a sent one",
        async () => {
          const created = await registrations.create({
            eventCode: firstCode,
            name: "Confirmation Probe",
            email: Email.parse("confirmation@example.invalid"),
            marketingConsent: false,
          });
          assertEquals(await registrations.findForConfirmation(created.id), {
            registration: created,
            confirmation: INITIAL_CONFIRMATION,
            readiness: {
              requiresInspectorProfile: true,
              inspectorProfileComplete: false,
            },
          });
          assertEquals(
            await registrations.findForConfirmation(crypto.randomUUID()),
            null,
          );

          const failedAt = new Date("2026-10-25T12:00:00.000Z");
          const failed = confirmationFailed(
            INITIAL_CONFIRMATION,
            new DomainError("MAIL_DELIVERY_FAILED"),
            failedAt,
          );
          await registrations.saveConfirmation(created.id, failed);
          assertEquals(
            (await registrations.findForConfirmation(created.id))
              ?.confirmation,
            failed,
          );

          const sentAt = new Date("2026-10-25T12:05:00.000Z");
          const sent = confirmationSucceeded(failed, "email-1", sentAt);
          await registrations.saveConfirmation(created.id, sent);
          assertEquals(
            (await registrations.findForConfirmation(created.id))
              ?.confirmation,
            sent,
          );

          // A late failure or a concurrent replay cannot undo the sent state.
          await registrations.saveConfirmation(
            created.id,
            confirmationFailed(failed, new Error("late"), sentAt),
          );
          await registrations.saveConfirmation(
            created.id,
            confirmationSucceeded(failed, "email-2", sentAt),
          );
          assertEquals(
            (await registrations.findForConfirmation(created.id))
              ?.confirmation,
            sent,
          );
        },
      );
      await t.step(
        "Registrations lists pending confirmations by the same rule as the domain",
        async () => {
          const minutes = (count: number) => count * 60 * 1000;
          const created = await registrations.create({
            eventCode: firstCode,
            name: "Pending Probe",
            email: Email.parse("pending@example.invalid"),
            marketingConsent: false,
          });
          const pendingAt = async (offsetMs: number) =>
            await registrations.findPendingConfirmations({
              now: new Date(Date.now() + offsetMs),
              limit: 1000,
            });

          // Fresh rows wait for the immediate webhook; stale ones are listed.
          assertEquals((await pendingAt(0)).includes(created.id), false);
          assertEquals(
            (await pendingAt(minutes(CONFIRMATION_RETRY_AFTER_MINUTES + 1)))
              .includes(created.id),
            true,
          );
          assertEquals(
            (await registrations.findPendingConfirmations({
              now: new Date(Date.now() + minutes(60)),
              limit: 1,
            })).length,
            1,
          );

          // A failed attempt restarts the wait from the attempt itself.
          const failed = confirmationFailed(
            INITIAL_CONFIRMATION,
            new DomainError("MAIL_DELIVERY_FAILED"),
            new Date(),
          );
          await registrations.saveConfirmation(created.id, failed);
          assertEquals(
            (await pendingAt(minutes(CONFIRMATION_RETRY_AFTER_MINUTES - 1)))
              .includes(created.id),
            false,
          );
          assertEquals(
            (await pendingAt(minutes(CONFIRMATION_RETRY_AFTER_MINUTES + 1)))
              .includes(created.id),
            true,
          );

          // Exhausted rows are no longer listed.
          await registrations.saveConfirmation(created.id, {
            ...failed,
            attempts: CONFIRMATION_MAX_ATTEMPTS,
          });
          assertEquals(
            (await pendingAt(minutes(60))).includes(created.id),
            false,
          );

          // Sent rows are never listed; neither is anything past the window.
          const other = await registrations.create({
            eventCode: firstCode,
            name: "Sent Probe",
            email: Email.parse("sent@example.invalid"),
            marketingConsent: false,
          });
          assertEquals(
            (await pendingAt(minutes(60))).includes(other.id),
            true,
          );
          await registrations.saveConfirmation(
            other.id,
            confirmationSucceeded(INITIAL_CONFIRMATION, "email-3", new Date()),
          );
          assertEquals(
            (await pendingAt(minutes(60))).includes(other.id),
            false,
          );
          const unsent = await registrations.create({
            eventCode: firstCode,
            name: "Old Probe",
            email: Email.parse("old@example.invalid"),
            marketingConsent: false,
          });
          assertEquals(
            (await registrations.findPendingConfirmations({
              now: new Date(Date.now() + CONFIRMATION_RETRY_WINDOW_MS + 1000),
              limit: 1000,
            })).includes(unsent.id),
            false,
          );
        },
      );
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
