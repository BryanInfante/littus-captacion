export interface FileStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(path: string): Promise<void>;
}
