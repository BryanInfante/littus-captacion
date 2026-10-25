export type FileStorageOperation = "directory" | "upload" | "delete";

/**
 * The file store refused or could not be reached. Carries only the operation
 * and the remote HTTP status so diagnostics never echo paths, URLs, or
 * credentials.
 */
export class FileStorageUnavailableError extends Error {
  constructor(
    readonly operation: FileStorageOperation,
    readonly status?: number,
  ) {
    super(`File storage ${operation} unavailable`);
    this.name = "FileStorageUnavailableError";
  }
}

export interface FileStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(path: string): Promise<void>;
}
