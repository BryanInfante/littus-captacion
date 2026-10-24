import type { RegisterPublicRegistrationInput } from "../application/registerPublicRegistration.ts";
import { Email } from "../domain/email.ts";
import { DomainError } from "../domain/errors.ts";
import { MAX_INSPECTOR_PHOTO_BYTES } from "../domain/inspectorProfile.ts";
import {
  parseEventCode,
  parseRegistrationName,
} from "../domain/registration.ts";
import { extractClientIp } from "../domain/requestLimits.ts";

const MAX_REQUEST_BYTES = MAX_INSPECTOR_PHOTO_BYTES + 256 * 1024;
const MAX_CHALLENGE_TOKEN_LENGTH = 2048;

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const parseChallengeToken = (input: unknown): string => {
  if (typeof input !== "string") throw new DomainError("INVALID_INPUT");
  const token = input.trim();
  if (token.length === 0 || token.length > MAX_CHALLENGE_TOKEN_LENGTH) {
    throw new DomainError("INVALID_INPUT");
  }
  return token;
};

const parseMarketingConsent = (input: unknown, multipart: boolean): boolean => {
  if (input === undefined) return false;
  if (typeof input === "boolean") return input;
  if (multipart && (input === "true" || input === "on")) return true;
  if (multipart && (input === "false" || input === "off")) return false;
  throw new DomainError("INVALID_INPUT");
};

const readBoundedBody = async (request: Request): Promise<Uint8Array> => {
  const header = request.headers.get("content-length");
  if (header !== null) {
    if (!/^\d+$/.test(header)) throw new DomainError("INVALID_INPUT");
    if (Number(header) > MAX_REQUEST_BYTES) {
      throw new DomainError("PAYLOAD_TOO_LARGE");
    }
  }
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new DomainError("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const field = (form: FormData, name: string): string | null => {
  const value = form.get(name);
  if (value === null) return null;
  if (typeof value !== "string") throw new DomainError("INVALID_INPUT");
  return value;
};

export const parseRegistrationRequest = async (
  request: Request,
): Promise<RegisterPublicRegistrationInput> => {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim()
    .toLowerCase();
  if (mediaType !== "application/json" && mediaType !== "multipart/form-data") {
    throw new DomainError("INVALID_INPUT");
  }
  const bytes = await readBoundedBody(request);
  let body: unknown;
  let inspector: RegisterPublicRegistrationInput["inspector"];
  try {
    if (mediaType === "application/json") {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } else {
      const form = await new Response(bytes.buffer as ArrayBuffer, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData();
      const names = [
        "nombres",
        "apellidos",
        "documento",
        "pais",
        "experiencia_anios",
        "empleador_declarado",
        "sin_empleador",
        "consentimiento_datos",
      ] as const;
      const fields: Record<string, unknown> = {};
      for (const name of names) fields[name] = field(form, name);
      const foto = form.get("foto");
      const photoTooLarge = foto instanceof File &&
        foto.size > MAX_INSPECTOR_PHOTO_BYTES;
      inspector = {
        fields,
        photoBytes: foto instanceof File
          ? new Uint8Array(await foto.arrayBuffer())
          : null,
        photoTooLarge,
      };
      body = {
        event_code: field(form, "event_code"),
        nombre: "Inspector",
        correo: field(form, "correo"),
        challenge_token: field(form, "challenge_token"),
        marketing_consent: field(form, "marketing_consent"),
      };
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_INPUT");
  }
  if (!isRecord(body) || typeof body.correo !== "string") {
    throw new DomainError("INVALID_INPUT");
  }
  if (mediaType === "application/json" && "ficha" in body) {
    throw new DomainError("INVALID_INPUT");
  }
  return {
    eventCode: parseEventCode(body.event_code),
    name: mediaType === "multipart/form-data"
      ? "Inspector"
      : parseRegistrationName(body.nombre),
    email: Email.parse(body.correo),
    marketingConsent: parseMarketingConsent(
      body.marketing_consent,
      mediaType === "multipart/form-data",
    ),
    challengeToken: parseChallengeToken(body.challenge_token),
    remoteIp: extractClientIp(request.headers.get("x-forwarded-for")),
    ...(inspector === undefined ? {} : { inspector }),
  };
};
