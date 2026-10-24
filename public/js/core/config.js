// @ts-check

// The only place in public/ for the settings that identify the deployed
// backend; an architecture test fails if they appear anywhere else. The
// publishable key is public by design: it only reaches what the anon role may
// read (the event catalog view), and registrations go through public-api.
export const SUPABASE_URL = "https://dkvuihkwuuocjjsscuso.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_VrTz-gg1X787doh2KgvX3g_ESS7BzS-";
