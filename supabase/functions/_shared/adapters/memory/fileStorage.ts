import type { FileStorage } from "../../ports/fileStorage.ts";

export class MemoryFileStorage implements FileStorage {
  readonly files = new Map<
    string,
    { readonly bytes: Uint8Array; readonly contentType: string }
  >();
  failUpload = false;
  failDelete = false;

  upload(
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    if (this.failUpload) {
      return Promise.reject(new Error("Storage unavailable"));
    }
    this.files.set(path, { bytes: bytes.slice(), contentType });
    return Promise.resolve();
  }

  delete(path: string): Promise<void> {
    if (this.failDelete) {
      return Promise.reject(new Error("Storage unavailable"));
    }
    this.files.delete(path);
    return Promise.resolve();
  }
}
