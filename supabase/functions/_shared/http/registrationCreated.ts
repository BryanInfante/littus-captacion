import { DomainError } from "../domain/errors.ts";

// The shape pg_net posts from private.eccia_post_to_edge_function.
const REGISTRATION_TABLE = "eccia_taller_inscripciones";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A webhook carries one id; anything larger is not ours.
const MAX_BODY_BYTES = 2048;

export type RegistrationCreated = { readonly registrationId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseRegistrationCreated = async (
  request: Request,
): Promise<RegistrationCreated> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new DomainError("INVALID_INPUT");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new DomainError("INVALID_INPUT");
  }
  if (
    !isRecord(payload) || payload.type !== "INSERT" ||
    payload.schema !== "public" || payload.table !== REGISTRATION_TABLE ||
    !isRecord(payload.record) || typeof payload.record.id !== "string" ||
    !UUID.test(payload.record.id)
  ) {
    throw new DomainError("INVALID_INPUT");
  }
  return { registrationId: payload.record.id };
};
