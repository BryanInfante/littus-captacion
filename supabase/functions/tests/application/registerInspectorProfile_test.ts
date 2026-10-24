import { assertEquals, assertRejects } from "../dev_deps.ts";
import { registerInspectorProfile } from "../../_shared/application/registerInspectorProfile.ts";
import { DomainError } from "../../_shared/domain/errors.ts";
import type { InspectorProfileReservation } from "../../_shared/ports/inspectorProfiles.ts";
import { MemoryInspectorProfiles } from "../../_shared/adapters/memory/inspectorProfiles.ts";
import { MemoryFileStorage } from "../../_shared/adapters/memory/fileStorage.ts";
import { createLogger } from "../../_shared/log.ts";
import { memoryPorts, NOW, openEvent } from "../fixtures/registration.ts";

const makeProfile = () => ({
  nombres: "ANA",
  apellidos: "PEREZ",
  nombreCompleto: "PEREZ ANA",
  documento: "AB123456",
  pais: "Ecuador",
  experienciaAnios: 0,
  empleadorDeclarado: null,
  sinEmpleador: true,
  consentimientoDatosEn: NOW.toISOString(),
});
const input = () => ({
  eventCode: openEvent().code,
  email: "ana@example.invalid",
  marketingConsent: true,
  profile: makeProfile(),
  photo: {
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    extension: "jpg" as const,
    contentType: "image/jpeg" as const,
  },
});
const setup = () => {
  const base = memoryPorts([openEvent({ requiresInspectorProfile: true })]);
  const profiles = new MemoryInspectorProfiles(base.events);
  const storage = new MemoryFileStorage();
  return { base, profiles, storage, logger: createLogger(() => {}) };
};

Deno.test("inspector registration reserves a path before upload and completes after the upload", async () => {
  const ports = setup();
  const registration = await registerInspectorProfile(input(), ports, NOW);
  assertEquals(registration.name, "PEREZ ANA");
  assertEquals(registration.marketingConsent, true);
  assertEquals(ports.storage.files.size, 1);
  const [path] = ports.storage.files.keys();
  assertEquals(path.includes(`/${makeProfile().documento}_`), true);
  assertEquals(path.endsWith(".jpg"), true);
});

Deno.test("completed profile duplicates are rejected without another upload", async () => {
  const ports = setup();
  await registerInspectorProfile(input(), ports, NOW);
  await assertRejects(
    () => registerInspectorProfile(input(), ports, NOW),
    DomainError,
    "ALREADY_REGISTERED",
  );
  assertEquals(ports.storage.files.size, 1);
});

Deno.test("fresh pending profiles conflict, while stale pending profiles retry the same reserved path", async () => {
  const ports = setup();
  const first = input();
  const staleId = "11111111-1111-4111-8111-111111111111";
  const reservedPath =
    `inscripciones/${first.eventCode}/fotos/${first.profile.documento}_${staleId}.jpg`;
  const reservation: InspectorProfileReservation = {
    ...first.profile,
    id: staleId,
    eventCode: first.eventCode,
    email: first.email,
    marketingConsent: false,
    photoPath: reservedPath,
  };
  const pending = await ports.profiles.claim(
    reservation,
    new Date(NOW.getTime() - 120_000),
    NOW,
  );
  assertEquals(pending.kind, "claimed");
  await assertRejects(
    () => registerInspectorProfile(first, ports, NOW),
    DomainError,
    "INSPECTOR_PROFILE_IN_PROGRESS",
  );
  const retried = await registerInspectorProfile(
    first,
    ports,
    new Date(NOW.getTime() + 121_000),
  );
  assertEquals(
    retried.id,
    pending.kind === "claimed" ? pending.registration.id : "",
  );
  assertEquals([...ports.storage.files.keys()], [reservedPath]);
});

Deno.test("failed upload compensates the pending profile and leaves no photo", async () => {
  const ports = setup();
  ports.storage.failUpload = true;
  await assertRejects(
    () => registerInspectorProfile(input(), ports, NOW),
    DomainError,
    "PHOTO_UPLOAD_FAILED",
  );
  assertEquals(ports.storage.files.size, 0);
  ports.storage.failUpload = false;
  assertEquals(
    (await registerInspectorProfile(input(), ports, NOW)).name,
    "PEREZ ANA",
  );
});

Deno.test("completion failure deletes both uploaded photo and pending registration profile", async () => {
  const ports = setup();
  const profileStore = {
    claim: (...args: Parameters<typeof ports.profiles.claim>) =>
      ports.profiles.claim(...args),
    markComplete: (_id: string, _now: Date) =>
      Promise.reject(new Error("database unavailable")),
    delete: (id: string) => ports.profiles.delete(id),
  };
  await assertRejects(
    () =>
      registerInspectorProfile(
        input(),
        { ...ports, profiles: profileStore },
        NOW,
      ),
    DomainError,
    "PHOTO_UPLOAD_FAILED",
  );
  assertEquals(ports.storage.files.size, 0);
  assertEquals(
    (await ports.profiles.claim(
      {
        ...input().profile,
        id: crypto.randomUUID(),
        eventCode: input().eventCode,
        email: input().email,
        marketingConsent: true,
        photoPath:
          "inscripciones/event/fotos/AB123456_22222222-2222-4222-8222-222222222222.jpg",
      },
      new Date(NOW.getTime() - 120_000),
      NOW,
    )).kind,
    "claimed",
  );
});
