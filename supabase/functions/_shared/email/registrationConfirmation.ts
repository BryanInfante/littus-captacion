import type { EventContent } from "../domain/event.ts";
import { escapeHtml, httpsUrlOrNull } from "./html.ts";

export type RegistrationConfirmationInput = {
  readonly content: EventContent;
  readonly recipientName: string;
  // Public site origin; the brand assets are served from it.
  readonly siteUrl: string;
};

export type RenderedEmail = {
  readonly subject: string;
  readonly html: string;
};

const KIND_LABELS: Readonly<Record<string, string>> = {
  webinar: "Webinar",
  curso: "Curso",
};

const detailRow = (label: string, value: string, last: boolean) =>
  `<p style="margin:0${last ? "" : " 0 8px"}"><strong>${label}:</strong> ${
    escapeHtml(value)
  }</p>`;

const primaryButton = (url: string, label: string) =>
  `<tr><td style="padding:0 0 12px">
                <a href="${
    escapeHtml(url)
  }" target="_blank" rel="noopener noreferrer" style="display:block;padding:14px 20px;border-radius:8px;background:#00AEEF;color:#061018;font-weight:700;line-height:1.4;text-align:center;text-decoration:none">${label}</a>
              </td></tr>`;

const secondaryButton = (url: string, label: string) =>
  `<tr><td>
                <a href="${
    escapeHtml(url)
  }" target="_blank" rel="noopener noreferrer" style="display:block;padding:13px 20px;border:1px solid #2D333B;border-radius:8px;color:#111318;font-weight:700;line-height:1.4;text-align:center;text-decoration:none">${label}</a>
              </td></tr>`;

export const renderRegistrationConfirmation = (
  input: RegistrationConfirmationInput,
): RenderedEmail => {
  const { content } = input;
  const firstName = escapeHtml(
    input.recipientName.trim().split(/\s+/)[0] || "profesional",
  );
  const title = escapeHtml(content.title);
  const kindLabel = KIND_LABELS[content.kind ?? ""] ?? "Evento";

  const present = ([
    ["Fecha", content.dateText],
    ["Horario", content.scheduleText],
    ["Duración", content.durationText],
    ["Modalidad", content.modalityText],
    ["Incluye", content.includesText],
  ] as const).flatMap(([label, value]) =>
    value === null || value.trim() === "" ? [] : [[label, value] as const]
  );
  const detailRows = present.map(([label, value], index) =>
    detailRow(label, value, index === present.length - 1)
  ).join("\n              ");
  const detailsBlock = present.length === 0 ? "" : `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border:1px solid #D9DEE3;border-radius:8px"><tr><td style="padding:20px 22px">
              ${detailRows}
            </td></tr></table>`;

  const communityUrl = httpsUrlOrNull(content.communityUrl);
  const streamUrl = httpsUrlOrNull(content.streamUrl);
  const buttons = [
    communityUrl === null
      ? ""
      : primaryButton(communityUrl, "Unirme a la comunidad de WhatsApp"),
    streamUrl === null
      ? ""
      : secondaryButton(streamUrl, "Abrir o guardar el live programado"),
  ].filter((button) => button !== "").join("\n              ");
  const accessBlock = buttons === "" ? "" : `
            <p style="margin:0 0 16px">Estos accesos forman parte de la información operativa de tu inscripción:</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">
              ${buttons}
            </table>`;

  const nextStepsText = content.nextStepsText?.trim() ?? "";
  const nextStepsBlock = nextStepsText === "" ? "" : `
            <p style="margin:0 0 8px;color:#111318;font-weight:700">Próximos pasos</p>
            <p style="margin:0 0 24px">${escapeHtml(nextStepsText)}</p>`;

  const classroomUrl = httpsUrlOrNull(content.classroomUrl);
  const classroomLink = classroomUrl === null ? "" : `
            <a href="${
    escapeHtml(classroomUrl)
  }" target="_blank" rel="noopener noreferrer" style="color:#00AEEF;font-size:13px;font-weight:700;line-height:1.6;text-decoration:underline">Visitar el aula virtual</a>`;

  const logoUrl = escapeHtml(`${input.siteUrl}/brand/assets/logo-dark.png`);

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Inscripción confirmada | ${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5f7;color:#111318;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Tu inscripción a ${title} fue registrada correctamente.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f5f7">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;overflow:hidden;border:1px solid #d9dee3;border-radius:8px;background:#fff">
          <tr><td style="padding:24px 32px;background:#0A0E13">
            <img src="${logoUrl}" width="190" alt="ECCIA, división de Littus Group America" style="display:block;width:190px;max-width:100%;height:auto;border:0" />
          </td></tr>
          <tr><td style="padding:40px 32px 16px">
            <p style="margin:0 0 12px;color:#00AEEF;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase">${kindLabel}</p>
            <h1 style="margin:0;color:#111318;font-size:30px;font-weight:700;line-height:1.2;letter-spacing:-.6px">Tu inscripción está confirmada</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 40px;color:#2D333B;font-size:16px;line-height:1.7">
            <p style="margin:0 0 20px">Hola ${firstName},</p>
            <p style="margin:0 0 20px">Registramos correctamente tu participación en <strong>${title}</strong>.</p>${detailsBlock}${accessBlock}${nextStepsBlock}
            <p style="margin:0">Si necesitas ayuda con tu inscripción, responde directamente a este correo.</p>
          </td></tr>
          <tr><td style="padding:28px 32px;border-top:1px solid #1E2329;background:#0A0E13">
            <p style="margin:0 0 8px;color:#F0F6FC;font-size:13px;font-weight:700;line-height:1.5">ECCIA · Littus Group America</p>
            <p style="margin:0 0 10px;color:#C9D1D9;font-size:12px;line-height:1.6">Este es un mensaje operativo relacionado con tu inscripción.</p>${classroomLink}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject: `Inscripción confirmada | ${content.title}`, html };
};
