import {
  type FileStorage,
  type FileStorageOperation,
  FileStorageUnavailableError,
} from "../../ports/fileStorage.ts";

export type WebDavConfig = {
  readonly webdavUrl: string;
  readonly username: string;
  readonly appPassword: string;
  readonly rootDirectory: string;
};

const segments = (path: string): string[] => {
  const values = path.split("/");
  if (
    values.some((segment, index) => {
      const photoFilename = index === values.length - 1 &&
        /^[0-9A-Z-]+_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$/
          .test(segment);
      return !photoFilename &&
        !/^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*$/.test(segment);
    })
  ) {
    throw new Error("Unsafe WebDAV path");
  }
  return values;
};

// Network failures carry no status, and the caught error text is dropped
// because it may echo the request URL or credentials.
const send = async (
  operation: FileStorageOperation,
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> => {
  try {
    return await fetcher(input, init);
  } catch {
    throw new FileStorageUnavailableError(operation);
  }
};

export const createNextcloudFileStorage = (
  config: WebDavConfig,
  fetcher: typeof fetch = fetch,
): FileStorage => {
  const authorization = `Basic ${
    btoa(`${config.username}:${config.appPassword}`)
  }`;
  const basePath = segments(config.rootDirectory);
  const url = (path: string): string =>
    `${config.webdavUrl.replace(/\/$/, "")}/${
      [...basePath, ...segments(path)].map(encodeURIComponent).join("/")
    }`;
  const ensureDirectory = async (path: string): Promise<void> => {
    const all = [...basePath, ...segments(path)];
    for (let index = 1; index <= all.length; index++) {
      const response = await send(
        "directory",
        fetcher,
        `${config.webdavUrl.replace(/\/$/, "")}/${
          all.slice(0, index).map(encodeURIComponent).join("/")
        }`,
        {
          method: "MKCOL",
          headers: { Authorization: authorization },
        },
      );
      if (response.status !== 201 && response.status !== 405) {
        throw new FileStorageUnavailableError("directory", response.status);
      }
    }
  };
  return {
    upload: async (path, bytes, contentType) => {
      const parts = segments(path);
      await ensureDirectory(parts.slice(0, -1).join("/"));
      const response = await send("upload", fetcher, url(path), {
        method: "PUT",
        headers: { Authorization: authorization, "Content-Type": contentType },
        body: new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
          type: contentType,
        }),
      });
      if (!response.ok) {
        throw new FileStorageUnavailableError("upload", response.status);
      }
    },
    delete: async (path) => {
      const response = await send("delete", fetcher, url(path), {
        method: "DELETE",
        headers: { Authorization: authorization },
      });
      if (!response.ok && response.status !== 404) {
        throw new FileStorageUnavailableError("delete", response.status);
      }
    },
  };
};
