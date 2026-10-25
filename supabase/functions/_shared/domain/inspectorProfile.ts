import { DomainError } from "./errors.ts";

export const MAX_INSPECTOR_PHOTO_BYTES = 5 * 1024 * 1024;

export type InspectorProfile = {
  readonly nombres: string;
  readonly apellidos: string;
  readonly nombreCompleto: string;
  readonly documento: string;
  readonly pais: string;
  readonly experienciaAnios: number;
  readonly empleadorDeclarado: string | null;
  readonly sinEmpleador: boolean;
  readonly consentimientoDatosEn: string;
};

export type InspectorPhoto = {
  readonly bytes: Uint8Array;
  readonly extension: "jpg" | "png";
  readonly contentType: "image/jpeg" | "image/png";
};

const text = (input: unknown, min: number, max: number): string => {
  if (typeof input !== "string") throw new DomainError("INVALID_INPUT");
  const value = input.trim().replace(/\s+/gu, " ");
  const length = [...value].length;
  if (length < min || length > max) throw new DomainError("INVALID_INPUT");
  return value;
};

export const parseInspectorProfile = (
  fields: Readonly<Record<string, unknown>>,
  now: Date,
): InspectorProfile => {
  const nombres = text(fields.nombres, 2, 60).toLocaleUpperCase("es");
  const apellidos = text(fields.apellidos, 2, 60).toLocaleUpperCase("es");
  const nombreCompleto = `${nombres} ${apellidos}`;
  if ([...nombreCompleto].length < 5 || [...nombreCompleto].length > 60) {
    throw new DomainError("INVALID_INPUT");
  }
  if (typeof fields.documento !== "string") {
    throw new DomainError("INVALID_INPUT");
  }
  const documento = fields.documento.trim().toLocaleUpperCase("en")
    .replace(/\s/gu, "");
  if (!/^[0-9A-Z-]{6,20}$/.test(documento)) {
    throw new DomainError("INVALID_INPUT");
  }
  const pais = text(fields.pais, 2, 60);
  const experienciaRaw = typeof fields.experiencia_anios === "string"
    ? fields.experiencia_anios.trim()
    : fields.experiencia_anios;
  const experienciaAnios = typeof experienciaRaw === "number"
    ? experienciaRaw
    : typeof experienciaRaw === "string" && /^\d{1,2}$/.test(experienciaRaw)
    ? Number(experienciaRaw)
    : Number.NaN;
  if (
    !Number.isInteger(experienciaAnios) || experienciaAnios < 0 ||
    experienciaAnios > 60
  ) {
    throw new DomainError("INVALID_INPUT");
  }
  const sinEmpleador = fields.sin_empleador === true ||
    fields.sin_empleador === "true" ||
    fields.sin_empleador === "on";
  const employerValue = typeof fields.empleador_declarado === "string"
    ? fields.empleador_declarado.trim().replace(/\s+/gu, " ")
    : "";
  if (sinEmpleador === (employerValue.length > 0)) {
    throw new DomainError("INVALID_INPUT");
  }
  const empleadorDeclarado = sinEmpleador ? null : text(employerValue, 2, 120);
  if (
    !(fields.consentimiento_datos === true ||
      fields.consentimiento_datos === "true" ||
      fields.consentimiento_datos === "on")
  ) {
    throw new DomainError("INVALID_INPUT");
  }
  if (Number.isNaN(now.getTime())) throw new RangeError("Invalid clock value");
  return {
    nombres,
    apellidos,
    nombreCompleto,
    documento,
    pais,
    experienciaAnios,
    empleadorDeclarado,
    sinEmpleador,
    consentimientoDatosEn: now.toISOString(),
  };
};

export const validateInspectorPhoto = (bytes: Uint8Array): InspectorPhoto => {
  if (bytes.length === 0 || bytes.length > MAX_INSPECTOR_PHOTO_BYTES) {
    throw new DomainError("INVALID_INPUT");
  }
  if (
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { bytes, extension: "jpg", contentType: "image/jpeg" };
  }
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.every((byte, index) => bytes[index] === byte)) {
    return { bytes, extension: "png", contentType: "image/png" };
  }
  throw new DomainError("INVALID_INPUT");
};
