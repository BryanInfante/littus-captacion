const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );

export const getFirstName = (fullName: string) =>
  fullName.trim().split(/\s+/)[0] || "profesional";

export type CourseAccess = {
  fullName: string;
  courseName: string;
  classroomUrl: string;
  usuario: string;
  password: string;
};

// Kept in sync with emails/eccia-end-vtptmt-acceso.html, which is the editable
// source used to preview and import the design. The copy lives here too because
// an Edge Function cannot read the repository at runtime.
//
// Deliberately WITHOUT {{{RESEND_UNSUBSCRIBE_URL}}} and {{{contact.first_name}}}:
// this is an operational message sent one by one through POST /emails, and only
// the Broadcasts API resolves those tokens. Included here they would render as
// literal text in the recipient's inbox.
export const renderCourseAccessEmail = (access: CourseAccess) => {
  const firstName = escapeHtml(getFirstName(access.fullName));
  const courseName = escapeHtml(access.courseName);
  const classroomUrl = escapeHtml(access.classroomUrl);
  const classroomLabel = escapeHtml(
    access.classroomUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  );
  const usuario = escapeHtml(access.usuario);
  const password = escapeHtml(access.password);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Acceso al aula virtual | ${courseName}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f3f5f7; color: #111318; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      Tu acceso al aula virtual de ECCIA ya está activo. Dentro encontrarás el material del entrenamiento.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background: #f3f5f7;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 600px; overflow: hidden; border: 1px solid #d9dee3; border-radius: 8px; background: #ffffff;">
            <tr>
              <td style="padding: 24px 32px; background: #0A0E13;">
                <img
                  src="https://preinscripcion.littusgroup.com/brand/assets/logo-dark.png"
                  width="190"
                  alt="ECCIA, división de Littus Group America"
                  style="display: block; width: 190px; max-width: 100%; height: auto; border: 0;"
                />
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 32px 16px;">
                <p style="margin: 0 0 12px; color: #00AEEF; font-size: 12px; font-weight: 700; line-height: 1.4; letter-spacing: 1.5px; text-transform: uppercase;">
                  Entrenamiento END
                </p>
                <h1 style="margin: 0; color: #111318; font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: -0.6px;">
                  Tu acceso al aula virtual ya está activo
                </h1>
              </td>
            </tr>

            <tr>
              <td style="padding: 16px 32px 40px; color: #2D333B; font-size: 16px; line-height: 1.7;">
                <p style="margin: 0 0 20px;">Hola ${firstName},</p>
                <p style="margin: 0 0 20px;">
                  Creamos tu cuenta en el aula virtual de ECCIA para el entrenamiento en
                  <strong>${courseName}</strong>.
                  Ahí encontrarás todo el material del curso.
                </p>

                <p style="margin: 0 0 12px; color: #111318; font-size: 13px; font-weight: 700; line-height: 1.5; letter-spacing: 1px; text-transform: uppercase;">
                  Tus credenciales
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px; border: 1px solid #D9DEE3; border-radius: 8px;">
                  <tr>
                    <td style="padding: 20px 22px;">
                      <p style="margin: 0 0 4px; color: #6E7681; font-size: 13px; line-height: 1.5;">Sitio</p>
                      <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
                        <a href="${classroomUrl}" target="_blank" rel="noopener noreferrer" style="color: #00AEEF; font-weight: 700; text-decoration: underline;">${classroomLabel}</a>
                      </p>

                      <p style="margin: 0 0 4px; color: #6E7681; font-size: 13px; line-height: 1.5;">Usuario</p>
                      <p style="margin: 0 0 16px; color: #111318; font-family: Consolas, 'Courier New', monospace; font-size: 16px; font-weight: 700; line-height: 1.5;">${usuario}</p>

                      <p style="margin: 0 0 4px; color: #6E7681; font-size: 13px; line-height: 1.5;">Contraseña</p>
                      <p style="margin: 0; color: #111318; font-family: Consolas, 'Courier New', monospace; font-size: 16px; font-weight: 700; line-height: 1.5;">${password}</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px;">
                  <tr>
                    <td>
                      <a href="${classroomUrl}" target="_blank" rel="noopener noreferrer" style="display: block; padding: 14px 20px; border-radius: 8px; background: #00AEEF; color: #061018; font-weight: 700; line-height: 1.4; text-align: center; text-decoration: none;">
                        Entrar al aula virtual
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin: 0 0 20px;">
                  Por seguridad, cambia la contraseña la primera vez que ingreses. Estas
                  credenciales son personales: no las compartas.
                </p>
                <p style="margin: 0;">
                  Si no puedes entrar o el material no aparece, responde directamente a este correo.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 28px 32px; border-top: 1px solid #1E2329; background: #0A0E13;">
                <p style="margin: 0 0 8px; color: #F0F6FC; font-size: 13px; font-weight: 700; line-height: 1.5;">
                  ECCIA · Littus Group America
                </p>
                <p style="margin: 0; color: #C9D1D9; font-size: 12px; line-height: 1.6;">
                  Este es un mensaje operativo con los datos de acceso al entrenamiento en el
                  que participas.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const renderCourseAccessText = (access: CourseAccess) =>
  `Hola ${getFirstName(access.fullName)},

Creamos tu cuenta en el aula virtual de ECCIA para el entrenamiento en ${access.courseName}. Ahí encontrarás todo el material del curso.

Sitio: ${access.classroomUrl}
Usuario: ${access.usuario}
Contraseña: ${access.password}

Por seguridad, cambia la contraseña la primera vez que ingreses. Estas credenciales son personales: no las compartas.

Si no puedes entrar o el material no aparece, responde directamente a este correo.

Equipo ECCIA`;
