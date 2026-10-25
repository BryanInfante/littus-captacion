import { assertEquals, assertRejects } from "../dev_deps.ts";
import { FileStorageUnavailableError } from "../../_shared/ports/fileStorage.ts";
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
    "inscripciones/ultrasonido-nivel-ii/MUNOZ PENA JOSE LUIS - 0912345678/foto.jpg";
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
  assertEquals(calls.some((call) => call.url.includes("0912345678")), true);
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
        "inscripciones/event/PEREZ ANA - AB123456/foto.jpg",
        new Uint8Array([1]),
        "image/jpeg",
      ),
    Error,
    "File storage directory unavailable",
  );
});

Deno.test("Nextcloud storage keeps accepting the legacy photo layout", async () => {
  const urls: string[] = [];
  const storage = createNextcloudFileStorage(config, (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  await storage.upload(
    "inscripciones/event/fotos/AB123456_11111111-1111-4111-8111-111111111111.jpg",
    new Uint8Array([1]),
    "image/jpeg",
  );
  assertEquals(
    urls.at(-1)?.endsWith("/AB123456_11111111-1111-4111-8111-111111111111.jpg"),
    true,
  );
});

Deno.test("Nextcloud storage encodes the participant folder and rejects unsafe folders or filenames", async () => {
  const urls: string[] = [];
  const storage = createNextcloudFileStorage(config, (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response(null, { status: 201 }));
  });
  await storage.upload(
    "inscripciones/event/MUNOZ PENA - AB123456/foto.png",
    new Uint8Array([1]),
    "image/png",
  );
  assertEquals(
    urls.at(-1)?.endsWith(
      "/inscripciones/event/MUNOZ%20PENA%20-%20AB123456/foto.png",
    ),
    true,
  );
  const calls = urls.length;
  for (
    const path of [
      "inscripciones/event/MUNOZ PENA - AB123456/foto.gif",
      "inscripciones/event/MUNOZ PENA - AB123456/foto.jpg.png",
      "inscripciones/event/MUNOZ PENA - AB123456/otra.jpg",
      "inscripciones/event/MUNOZ PENA - AB123456/../foto.jpg",
      "inscripciones/event/MUNOZ  PENA - AB123456/foto.jpg",
      "inscripciones/event/MUNOZ PENA - AB123456 /foto.jpg",
      "inscripciones/event/muñoz pena - AB123456/foto.jpg",
      "inscripciones/event/MUNOZ.PENA - AB123456/foto.jpg",
      "inscripciones/event/MUNOZ/PENA - AB123456/foto.jpg",
      "inscripciones/event/MUNOZ_PENA - AB123456/foto.jpg",
      "inscripciones/event/MUNOZ PENA - AB123456/",
      "inscripciones/event//foto.jpg",
    ]
  ) {
    await assertRejects(
      () => storage.upload(path, new Uint8Array([1]), "image/jpeg"),
      Error,
      "Unsafe WebDAV path",
    );
  }
  assertEquals(urls.length, calls);
});

const photoPath = "inscripciones/event/PEREZ ANA - AB123456/foto.jpg";
const failure = async (
  fn: () => Promise<void>,
): Promise<FileStorageUnavailableError> => {
  try {
    await fn();
  } catch (error) {
    if (error instanceof FileStorageUnavailableError) return error;
    throw error;
  }
  throw new Error("expected FileStorageUnavailableError");
};
const upload = (fetcher: typeof fetch) =>
  createNextcloudFileStorage(config, fetcher).upload(
    photoPath,
    new Uint8Array([1]),
    "image/jpeg",
  );

Deno.test("Nextcloud storage reports the WebDAV status of a failed MKCOL", async () => {
  const error = await failure(() =>
    upload(() => Promise.resolve(new Response(null, { status: 401 })))
  );
  assertEquals([error.operation, error.status], ["directory", 401]);
});

Deno.test("Nextcloud storage reports the WebDAV status of a failed PUT", async () => {
  const error = await failure(() =>
    upload((_input, init) =>
      Promise.resolve(
        new Response(null, { status: init?.method === "PUT" ? 507 : 201 }),
      )
    )
  );
  assertEquals([error.operation, error.status], ["upload", 507]);
});

Deno.test("Nextcloud storage reports the WebDAV status of a failed DELETE", async () => {
  const storage = createNextcloudFileStorage(
    config,
    () => Promise.resolve(new Response(null, { status: 403 })),
  );
  const error = await failure(() => storage.delete(photoPath));
  assertEquals([error.operation, error.status], ["delete", 403]);
});

Deno.test("Nextcloud storage omits status and the cause text on network failures", async () => {
  const error = await failure(() =>
    upload(() => Promise.reject(new Error("connect fixture-password")))
  );
  assertEquals([error.operation, error.status], ["directory", undefined]);
  assertEquals(error.message.includes("fixture-password"), false);
  assertEquals(error.cause, undefined);
});
