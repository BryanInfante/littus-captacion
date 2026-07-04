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

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required secret: ${name}`)
  return value
}

const buildWebDavUrl = (path: string) => {
  const webdavUrl = requiredEnv('NEXTCLOUD_WEBDAV_URL').replace(/\/$/, '')
  const cleanPath = path.split('/').map(encodeURIComponent).join('/')
  return `${webdavUrl}/${cleanPath}`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const url = new URL(request.url)
  const code = url.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return jsonResponse({ error: 'Certificate code is required.' }, 400)

  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const supabaseSecretKey = getSecretKey()
  if (!supabaseSecretKey) return jsonResponse({ error: 'Function is not configured.' }, 500)

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: certificate, error } = await supabaseAdmin
    .from(CLAIMS_TABLE)
    .select('codigo_certificado,nextcloud_path,certificate_status')
    .eq('codigo_certificado', code)
    .in('certificate_status', ['uploaded', 'emailed'])
    .maybeSingle()

  if (error) return jsonResponse({ error: 'Certificate lookup failed.' }, 500)
  if (!certificate?.nextcloud_path) return jsonResponse({ error: 'Certificate not found.' }, 404)

  const username = requiredEnv('NEXTCLOUD_USERNAME')
  const appPassword = requiredEnv('NEXTCLOUD_APP_PASSWORD')
  const auth = btoa(`${username}:${appPassword}`)
  const response = await fetch(buildWebDavUrl(certificate.nextcloud_path), {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })

  if (!response.ok || !response.body) return jsonResponse({ error: 'Certificate file is unavailable.' }, 502)

  return new Response(response.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${certificate.codigo_certificado}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
})
