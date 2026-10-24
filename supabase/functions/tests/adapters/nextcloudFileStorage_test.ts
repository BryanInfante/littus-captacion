import { assertEquals, assertRejects } from "../dev_deps.ts";
import { createNextcloudFileStorage } from "../../_shared/adapters/nextcloud/fileStorage.ts";

const config = {
  webdavUrl: "https://cloud.example.invalid/remote.php/dav/files/user",
  username: "fixture-user",
  appPassword: "fixture-password",
  rootDirectory: "Littus Root",
};

Deno.test("Nextcloud storage creates directories accepting 201 and 405, then uploads and deletes with Basic auth", async () => {
  const calls: { url: string; method: string; authorization: string | null }[] =
    [];
  const storage = createNextcloudFileStorage(config, (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const status = calls.length === 2 ? 405 : 201;
    return Promise.resolve(new Response(null, { status }));
  });
  const path =
    "inscripciones/ultrasonido-nivel-ii/fotos/AB123456_11111111-1111-4111-8111-111111111111.jpg";
  await storage.upload(path, new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
  await storage.delete(path);
  assertEquals(calls[0].method, "MKCOL");
  assertEquals(calls[1].method, "MKCOL");
  assertEquals(calls.at(-2)?.method, "PUT");
  assertEquals(calls.at(-1)?.method, "DELETE");
  assertEquals(
    calls.every((call) =>
      call.authorization === `Basic ${btoa("fixture-user:fixture-password")}`
    ),
    true,
  );
  assertEquals(calls.some((call) => call.url.includes("AB123456")), true);
});

Deno.test("Nextcloud storage rejects unsafe relative paths and unexpected WebDAV statuses", async () => {
  const storage = createNextcloudFileStorage(
    config,
    () => Promise.resolve(new Response(null, { status: 500 })),
  );
  await assertRejects(
    () =>
      storage.upload("../outside/photo.jpg", new Uint8Array([1]), "image/jpeg"),
    Error,
    "Unsafe WebDAV path",
  );
  await assertRejects(
    () =>
      storage.upload(
        "inscripciones/event/fotos/AB123456_11111111-1111-4111-8111-111111111111.jpg",
        new Uint8Array([1]),
        "image/jpeg",
      ),
    Error,
    "WebDAV directory unavailable",
  );
});
