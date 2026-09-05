import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CLAIMS_TABLE = 'eccia_masterclass_certificados'
const EVENTS_TABLE = 'eccia_eventos'

// 'external' covers certificates issued outside the platform (designed by hand,
// no Nextcloud PDF). They are genuine and must validate; only the download link
// is unavailable for them.
const VALID_STATUSES = ['uploaded', 'emailed', 'external']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getSecretKey = () => {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) return JSON.parse(secretKeys).default as string
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return jsonResponse({ error: 'Método no permitido.' }, 405)

  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return jsonResponse({ valid: false, error: 'Código requerido.' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseSecretKey = getSecretKey()
  if (!supabaseUrl || !supabaseSecretKey) return jsonResponse({ error: 'La función no está configurada.' }, 500)

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: certificate, error } = await supabaseAdmin
    .from(CLAIMS_TABLE)
    .select('codigo_certificado,nombre_completo,masterclass_codigo,certificate_status,validation_url,certificate_emailed_at,certificate_uploaded_at,certificate_generated_at')
    .eq('codigo_certificado', code)
    .maybeSingle()

  if (error) return jsonResponse({ error: 'No se pudo validar el certificado.' }, 500)
  if (!certificate) return jsonResponse({ valid: false })

  // Deliberately a second query rather than a PostgREST embed: the foreign key
  // between the two tables was added recently, and an embed would depend on
  // PostgREST's schema cache having picked it up. Two round trips are cheaper
  // than a validation page that breaks after a schema reload.
  const { data: event } = await supabaseAdmin
    .from(EVENTS_TABLE)
    .select('event_title,duracion,fecha_texto')
    .eq('masterclass_codigo', certificate.masterclass_codigo)
    .maybeSingle()

  const issuedAt = certificate.certificate_emailed_at ?? certificate.certificate_uploaded_at ?? certificate.certificate_generated_at

  // Event fields are returned as null when the course is unknown, never as a
  // default. A wrong course name on a validation page is worse than a missing
  // one: it misrepresents what the person actually earned.
  return jsonResponse({
    valid: VALID_STATUSES.includes(certificate.certificate_status),
    codigo_certificado: certificate.codigo_certificado,
    nombre_completo: certificate.nombre_completo,
    event_title: event?.event_title ?? null,
    duration: event?.duracion ?? null,
    event_date: event?.fecha_texto ?? null,
    masterclass_codigo: certificate.masterclass_codigo,
    certificate_status: certificate.certificate_status,
    issued_at: issuedAt,
  })
})
