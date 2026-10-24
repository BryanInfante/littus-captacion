import { DomainError } from "../domain/errors.ts";
import type {
  InspectorPhoto,
  InspectorProfile,
} from "../domain/inspectorProfile.ts";
import type { Registration } from "../domain/registration.ts";
import type { FileStorage } from "../ports/fileStorage.ts";
import type { InspectorProfiles } from "../ports/inspectorProfiles.ts";
import type { Logger } from "../log.ts";

const PENDING_PROFILE_RETRY_MILLISECONDS = 2 * 60 * 1000;

export const registerInspectorProfile = async (input: {
  readonly eventCode: string;
  readonly email: string;
  readonly marketingConsent: boolean;
  readonly profile: InspectorProfile;
  readonly photo: InspectorPhoto;
}, ports: {
  readonly profiles: InspectorProfiles;
  readonly storage: FileStorage;
  readonly logger: Logger;
}, now: Date): Promise<Registration> => {
  const id = crypto.randomUUID();
  const photoPath =
    `inscripciones/${input.eventCode}/fotos/${input.profile.documento}_${id}.${input.photo.extension}`;
  const claim = await ports.profiles.claim(
    {
      ...input.profile,
      id,
      eventCode: input.eventCode,
      email: input.email,
      marketingConsent: input.marketingConsent,
      photoPath,
    },
    new Date(now.getTime() - PENDING_PROFILE_RETRY_MILLISECONDS),
    now,
  );
  if (claim.kind === "complete") throw new DomainError("ALREADY_REGISTERED");
  if (claim.kind === "in_progress") {
    throw new DomainError("INSPECTOR_PROFILE_IN_PROGRESS");
  }

  try {
    await ports.storage.upload(
      claim.photoPath,
      input.photo.bytes,
      input.photo.contentType,
    );
  } catch {
    await compensate(claim.id, claim.photoPath, ports);
    throw new DomainError("PHOTO_UPLOAD_FAILED");
  }
  try {
    await ports.profiles.markComplete(claim.id, now);
  } catch {
    await compensate(claim.id, claim.photoPath, ports);
    throw new DomainError("PHOTO_UPLOAD_FAILED");
  }
  return claim.registration;
};

const compensate = async (
  id: string,
  photoPath: string,
  ports: {
    readonly profiles: InspectorProfiles;
    readonly storage: FileStorage;
    readonly logger: Logger;
  },
): Promise<void> => {
  try {
    await ports.storage.delete(photoPath);
  } catch {
    ports.logger.log(id, { event: "inspector.photo_orphaned", status: 500 });
  }
  try {
    await ports.profiles.delete(id);
  } catch {
    ports.logger.log(id, {
      event: "inspector.profile_cleanup_failed",
      status: 500,
    });
  }
};
