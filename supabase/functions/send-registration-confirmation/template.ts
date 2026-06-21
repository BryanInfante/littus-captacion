const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  )

export const renderConfirmationEmail = (fullName: string) => {
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || 'profesional')

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Inscripción confirmada | Domina el Scan A</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5f7;color:#111318;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Tu inscripción al taller técnico de ECCIA fue registrada correctamente.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f5f7">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;overflow:hidden;border:1px solid #d9dee3;border-radius:8px;background:#fff">
          <tr><td style="padding:24px 32px;background:#0A0E13">
            <img src="https://preinscripcion.littusgroup.com/brand/assets/logo-dark.png" width="190" alt="ECCIA, división de Littus Group America" style="display:block;width:190px;max-width:100%;height:auto;border:0" />
          </td></tr>
          <tr><td style="padding:40px 32px 16px">
            <p style="margin:0 0 12px;color:#00AEEF;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase">Taller técnico gratuito</p>
            <h1 style="margin:0;color:#111318;font-size:30px;font-weight:700;line-height:1.2;letter-spacing:-.6px">Tu inscripción está confirmada</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 40px;color:#2D333B;font-size:16px;line-height:1.7">
            <p style="margin:0 0 20px">Hola ${firstName},</p>
            <p style="margin:0 0 20px">Registramos correctamente tu participación en <strong>Domina la lectura del Scan A</strong>.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;border:1px solid #D9DEE3;border-radius:8px"><tr><td style="padding:20px 22px">
              <p style="margin:0 0 8px"><strong>Fecha:</strong> 02 de julio</p>
              <p style="margin:0 0 8px"><strong>Horario:</strong> 18h00 a 20h00</p>
              <p style="margin:0 0 8px"><strong>Modalidad:</strong> Online y en directo</p>
              <p style="margin:0"><strong>Incluye:</strong> Certificado de participación</p>
            </td></tr></table>
            <p style="margin:0 0 20px">La transmisión será por el canal de YouTube. Te enviaremos el enlace de acceso cuando esté disponible.</p>
            <p style="margin:0">Si necesitas ayuda con tu inscripción, responde directamente a este correo.</p>
          </td></tr>
          <tr><td style="padding:28px 32px;border-top:1px solid #1E2329;background:#0A0E13">
            <p style="margin:0 0 8px;color:#F0F6FC;font-size:13px;font-weight:700;line-height:1.5">ECCIA · Littus Group America</p>
            <p style="margin:0;color:#C9D1D9;font-size:12px;line-height:1.6">Este es un mensaje operativo relacionado con tu inscripción al taller.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
