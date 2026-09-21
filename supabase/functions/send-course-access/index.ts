import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  renderCourseAccessEmail,
  renderCourseAccessText,
  type CourseAccess,
} from './template.ts'

const RESEND_API_URL = 'https://api.resend.com'
const TABLE_NAME = 'eccia_taller_inscripciones'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'
const SUBJECT = 'Tu acceso al aula virtual de ECCIA'
const CLASSROOM_URL = 'https://cursos.littusgroup.com/'
const APPROVAL_PHRASE = 'APROBAR ENVIO ACCESOS AULA VIRTUAL'

// The sample never carries a real password. A test send proves the layout, the
// sender, the subject and the links; it must not become a second copy of
// someone's credentials sitting in another inbox.
const SAMPLE_ACCESS = {
  fullName: 'PROFESIONAL DE PRUEBA',
  usuario: 'usuario.de.prueba@ejemplo.com',
  password: 'Contrasena-De-Prueba-123',
}

type Credential = {
  correo?: string
  usuario?: string
  password?: string
}

type AccessPayload = {
  mode?: 'preview' | 'test' | 'send'
  approval_phrase?: string
  taller_codigo?: string
  course_name?: string
  test_email?: string
  credentials?: Credential[]
}

type Registration = {
  id: string
  nombre: string
  correo: string
  taller_codigo: string | null
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const getSecretKey = () => {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (secretKeys) {
    return JSON.parse(secretKeys).default as string
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseSecretKey = getSecretKey()

  if (!supabaseUrl || !supabaseSecretKey) {
    return jsonResponse({ error: 'La función no está configurada.' }, 500)
  }

  let payload: AccessPayload

  try {
    payload = await request.json()
  } catch {
    payload = { mode: 'preview' }
  }

  const mode = payload.mode ?? 'preview'
  const tallerCodigo = payload.taller_codigo?.trim()
  const courseName = payload.course_name?.trim()

  // No default course: a wrong taller_codigo would mail credentials to the
  // wrong cohort, and a silent fallback is exactly how that happens.
  if (!tallerCodigo) {
    return jsonResponse({ error: 'Falta taller_codigo en el payload.' }, 400)
  }

  if (!courseName) {
    return jsonResponse({ error: 'Falta course_name en el payload.' }, 400)
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: registrations, error: registrationsError } = await supabaseAdmin
    .from(TABLE_NAME)
    .select('id,nombre,correo,taller_codigo')
    .eq('taller_codigo', tallerCodigo)

  if (registrationsError) {
    return jsonResponse({ error: 'No se pudieron leer las inscripciones.' }, 500)
  }

  const recipients = (registrations ?? []) as Registration[]

  const credentialsByEmail = new Map<string, Credential>()

  for (const credential of payload.credentials ?? []) {
    if (credential.correo) {
      credentialsByEmail.set(normalizeEmail(credential.correo), credential)
    }
  }

  const missingCredentials = recipients
    .filter((registration) => {
      const credential = credentialsByEmail.get(normalizeEmail(registration.correo))
      return !credential?.usuario || !credential?.password
    })
    .map((registration) => registration.correo)

  if (mode === 'preview') {
    return jsonResponse({
      status: 'preview',
      taller_codigo: tallerCodigo,
      course_name: courseName,
      recipients_count: recipients.length,
      credentials_provided: credentialsByEmail.size,
      missing_credentials_count: missingCredentials.length,
      missing_credentials: missingCredentials,
      subject: SUBJECT,
      from: FROM,
      reply_to: REPLY_TO,
      classroom_url: CLASSROOM_URL,
      approval_phrase: APPROVAL_PHRASE,
      sample_html: renderCourseAccessEmail({
        ...SAMPLE_ACCESS,
        courseName,
        classroomUrl: CLASSROOM_URL,
      }),
    })
  }

  if (mode === 'test') {
    const testEmail = payload.test_email?.trim()

    if (!testEmail) {
      return jsonResponse({ error: 'Falta test_email en el payload.' }, 400)
    }

    if (!resendApiKey) {
      return jsonResponse({ error: 'La API key de Resend no está configurada.' }, 500)
    }

    const access: CourseAccess = {
      ...SAMPLE_ACCESS,
      courseName,
      classroomUrl: CLASSROOM_URL,
    }

    const resendResponse = await fetch(`${RESEND_API_URL}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [testEmail],
        reply_to: REPLY_TO,
        subject: `[PRUEBA] ${SUBJECT}`,
        html: renderCourseAccessEmail(access),
        text: renderCourseAccessText(access),
        tags: [{ name: 'email_type', value: 'course_access_test' }],
      }),
    })

    const resendBody = await resendResponse.json().catch(() => ({}))

    if (!resendResponse.ok || typeof resendBody.id !== 'string') {
      return jsonResponse(
        {
          error: 'Resend rechazó el correo de prueba.',
          status: resendResponse.status,
          detail: resendBody,
        },
        502,
      )
    }

    return jsonResponse({
      status: 'test_sent',
      to: testEmail,
      email_id: resendBody.id,
      recipients_count: recipients.length,
      missing_credentials_count: missingCredentials.length,
      missing_credentials: missingCredentials,
    })
  }

  if (payload.approval_phrase !== APPROVAL_PHRASE) {
    return jsonResponse(
      {
        error: 'Aprobación requerida antes de enviar.',
        expected_approval_phrase: APPROVAL_PHRASE,
      },
      403,
    )
  }

  if (recipients.length === 0) {
    return jsonResponse(
      { error: `No hay inscripciones con taller_codigo '${tallerCodigo}'.` },
      409,
    )
  }

  // Fail closed. Sending a credentials email with a blank user or password is
  // worse than sending nothing: it is useless to the recipient and it burns the
  // one message they will actually read.
  if (missingCredentials.length > 0) {
    return jsonResponse(
      {
        error: 'Faltan credenciales para parte de la lista. No se envió nada.',
        missing_credentials: missingCredentials,
      },
      409,
    )
  }

  if (!resendApiKey) {
    return jsonResponse({ error: 'La API key de Resend no está configurada.' }, 500)
  }

  const sent: Array<{ registration_id: string; email: string; email_id: string }> = []
  const failed: Array<{ registration_id: string; email: string; error: string }> = []

  for (const registration of recipients) {
    const credential = credentialsByEmail.get(normalizeEmail(registration.correo))!

    const access: CourseAccess = {
      fullName: registration.nombre,
      courseName,
      classroomUrl: CLASSROOM_URL,
      usuario: credential.usuario!,
      password: credential.password!,
    }

    try {
      const resendResponse = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `course-access/${tallerCodigo}/${registration.id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [registration.correo],
          reply_to: REPLY_TO,
          subject: SUBJECT,
          html: renderCourseAccessEmail(access),
          text: renderCourseAccessText(access),
          tags: [
            { name: 'email_type', value: 'course_access' },
            { name: 'workshop', value: tallerCodigo },
          ],
        }),
      })

      const resendBody = await resendResponse.json().catch(() => ({}))

      if (!resendResponse.ok || typeof resendBody.id !== 'string') {
        throw new Error(
          `Resend rechazó el acceso (${resendResponse.status}): ${JSON.stringify(resendBody)}`,
        )
      }

      sent.push({
        registration_id: registration.id,
        email: registration.correo,
        email_id: resendBody.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'

      failed.push({
        registration_id: registration.id,
        email: registration.correo,
        error: message.slice(0, 500),
      })
    }

    await wait(150)
  }

  return jsonResponse(
    {
      status: failed.length > 0 ? 'partial' : 'sent',
      sent_count: sent.length,
      failed_count: failed.length,
      sent,
      failed,
    },
    failed.length > 0 ? 207 : 200,
  )
})
