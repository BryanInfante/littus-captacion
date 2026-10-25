import type { EventContent } from "../../_shared/domain/event.ts";

export const SCAN_A_CODE = "ultrasonido-industrial-scan-a";
export const UT2_CODE = "ultrasonido-nivel-ii";
export const SITE_URL = "https://site.example.invalid";

// Event-specific copy lives in the event row; these fixtures stand in for it.
export const scanAContent: EventContent = {
  code: SCAN_A_CODE,
  title: "Domina la lectura del Scan A",
  kind: "webinar",
  dateText: "03 de julio de 2026",
  durationText: "2h",
  scheduleText: "15h00 a 17h00",
  modalityText: "Online y en directo",
  includesText: "Certificado de participación",
  communityUrl: "https://community.example.invalid/scan-a",
  streamUrl: "https://stream.example.invalid/scan-a",
  classroomUrl: "https://classroom.example.invalid/",
};

export const ut2Content: EventContent = {
  code: UT2_CODE,
  title: "Ultrasonido Convencional Nivel II",
  kind: "curso",
  dateText: "Del 17 al 25 de octubre de 2026",
  durationText: "40 horas",
  scheduleText: null,
  modalityText: null,
  includesText: null,
  communityUrl: null,
  streamUrl: null,
  classroomUrl: "https://classroom.example.invalid/",
};
