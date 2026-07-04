import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CLAIMS_TABLE = 'eccia_masterclass_certificados'

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

  const issuedAt = certificate.certificate_emailed_at ?? certificate.certificate_uploaded_at ?? certificate.certificate_generated_at

  return jsonResponse({
    valid: ['uploaded', 'emailed'].includes(certificate.certificate_status),
    codigo_certificado: certificate.codigo_certificado,
    nombre_completo: certificate.nombre_completo,
    event_title: 'Seminario de Ultrasonido Industrial Nivel I',
    duration: '2h',
    event_date: '03 de julio de 2026',
    masterclass_codigo: certificate.masterclass_codigo,
    certificate_status: certificate.certificate_status,
    issued_at: issuedAt,
  })
})
