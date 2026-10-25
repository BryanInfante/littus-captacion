import { assertEquals, assertThrows } from "../dev_deps.ts";
import {
  parseInspectorProfile,
  participantFolderName,
  validateInspectorPhoto,
} from "../../_shared/domain/inspectorProfile.ts";

const fields = {
  nombres: "  ana   maría ",
  apellidos: " pérez ",
  documento: " ab 12-3456 ",
  pais: " Ecuador ",
  experiencia_anios: "0",
  empleador_declarado: " Taller Norte ",
  sin_empleador: false,
  consentimiento_datos: true,
};

Deno.test("inspector profile normalizes fields and derives consent time from server clock", () => {
  const parsed = parseInspectorProfile(
    fields,
    new Date("2026-10-24T12:00:00.000Z"),
  );
  assertEquals(parsed.nombreCompleto, "ANA MARÍA PÉREZ");
  assertEquals(parsed.documento, "AB12-3456");
  assertEquals(parsed.pais, "Ecuador");
  assertEquals(parsed.experienciaAnios, 0);
  assertEquals(parsed.empleadorDeclarado, "Taller Norte");
  assertEquals(parsed.consentimientoDatosEn, "2026-10-24T12:00:00.000Z");
});

Deno.test("inspector profile rejects invalid bounds, consent and employer XOR", () => {
  for (
    const changes of [
      { nombres: "A" },
      { apellidos: "A" },
      { documento: "ab.c 123" },
      { pais: "X" },
      { experiencia_anios: "1.5" },
      { experiencia_anios: "61" },
      { consentimiento_datos: false },
      { sin_empleador: true },
      { sin_empleador: false, empleador_declarado: " " },
    ]
  ) {
    assertThrows(() =>
      parseInspectorProfile({ ...fields, ...changes }, new Date())
    );
  }
});

Deno.test("photo validation accepts JPEG and PNG signatures only, up to five MiB", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertEquals(validateInspectorPhoto(jpeg).extension, "jpg");
  assertEquals(validateInspectorPhoto(png).contentType, "image/png");
  assertThrows(() => validateInspectorPhoto(new Uint8Array([1, 2, 3])));
  assertThrows(() =>
    validateInspectorPhoto(new Uint8Array(5 * 1024 * 1024 + 1))
  );
});

Deno.test("participant folder is SURNAMES NAMES - DOCUMENT without accents or punctuation", () => {
  assertEquals(
    participantFolderName("MUÑOZ PEÑA", "JOSÉ-LUIS", "0912345678"),
    "MUNOZ PENA JOSE LUIS - 0912345678",
  );
  assertEquals(
    participantFolderName("pérez-gil", "  ana   maría ", "AB12-3456"),
    "PEREZ GIL ANA MARIA - AB12-3456",
  );
  assertEquals(
    participantFolderName("O'Brien/..", "Zoë (Jr.)", "AB123456"),
    "O BRIEN ZOE JR - AB123456",
  );
});

Deno.test("participant folder falls back to the document when the name has no letters or digits", () => {
  assertEquals(participantFolderName("--", "..", "AB123456"), "AB123456");
  assertEquals(participantFolderName("日本", "  ", "AB123456"), "AB123456");
});
