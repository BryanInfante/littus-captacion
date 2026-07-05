# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static landing page + Supabase backend for ECCIA (Littus Group) workshop registration and certificate
issuance. No frontend framework, bundler, or build step — `public/` is plain HTML/CSS/JS served
directly (locally and via GitHub Pages). Backend logic lives in Supabase Edge Functions (Deno/TypeScript).

Read `README.md` for the full architecture and operational runbook, `EMAIL_OPERATIONS.md` for Resend
campaign procedures, and `AGENTS.md` for mandatory brand rules before any visual change.

## Commands

There is no `package.json` / npm toolchain — do not introduce one without asking.

Serve the static site locally:
```powershell
npx serve public
```
(or just open `public/index.html` directly / use a Live Server extension).

Run tests (PowerShell 7+):
```powershell
.\tests\landing.tests.ps1
.\tests\certificate-claim.tests.ps1
.\tests\certificate-generation.tests.ps1
```
If execution policy blocks the script or PowerShell 5 mis-decodes UTF-8, use the workaround documented
in `README.md` (`Pruebas` section) — it loads the script as a scriptblock with `$PSScriptRoot` rebound.

Tests are static assertion scripts: they read the relevant `public/`, `emails/`, and
`supabase/functions/**/index.ts` files as raw text and assert on required markers/strings (see
`Assert-Contains` in `tests/landing.tests.ps1`). There is no DOM/runtime execution — when adding a
feature, add matching string assertions to the relevant `tests/*.ps1` file rather than a JS test runner.

Deploy: GitHub Actions handle deployment on push to `main`. `pages.yml` publishes `public/` to GitHub
Pages. `deploy-supabase-functions.yml` deploys `issue-certificate` only, and only when files under
`supabase/functions/issue-certificate/**` or `supabase/config.toml` change — other Edge Functions
(`sync-resend-contact`, `send-registration-confirmation`, `send-workshop-reminder`,
`validate-certificate`, `download-certificate`) must be deployed manually via `supabase functions deploy
<name>` until a workflow is added for them.

## Architecture

Two independent flows share the same Supabase project (`airen`), both driven by public forms that POST
directly from the browser using a Supabase **publishable key** (never a secret/service-role key):

**1. Workshop registration** (`public/index.html` + `public/app.js` → table
`eccia_taller_inscripciones`): browser inserts a row via PostgREST. A DB trigger asynchronously invokes
`send-registration-confirmation` (always) and, only if `marketing_consent` is true, `sync-resend-contact`
to upsert the contact into Resend's audience/segment. `send-workshop-reminder` is a separate function for
sending reminders to registered attendees.

**2. Certificate issuance** (`public/certificado.html`/`certificado_variante_blanca.html` +
`public/certificados.js` → table `eccia_masterclass_certificados`): browser POSTs name+email to the
`issue-certificate` Edge Function directly (not a DB insert). That function:
- validates/normalizes input, generates a unique `codigo_certificado` (`ECCIA-UT1-XXXXXXXX`),
- renders a PDF with `pdf-lib` + `fontkit` (fonts fetched at runtime from Google Fonts raw URLs) and a QR
  code (`npm:qrcode`) pointing at `validar-certificado.html?code=...`,
- uploads the PDF to Nextcloud over WebDAV (`NEXTCLOUD_WEBDAV_URL`/`NEXTCLOUD_USERNAME`/
  `NEXTCLOUD_APP_PASSWORD` secrets) and stores the resulting `nextcloud_path`,
- emails the download/validation links via Resend,
- tracks progress through `certificate_status`: `pending → rendering → uploaded → emailed` (or `failed`,
  with `certificate_error`/`certificate_attempts`).

`validate-certificate` (public GET by `code`) reports whether a certificate is valid and returns display
metadata. `download-certificate` (public GET by `code`) proxies the PDF bytes from Nextcloud (only for
`uploaded`/`emailed` status) — the WebDAV credentials never reach the browser. Both of these plus
`issue-certificate` have `verify_jwt = false` in `supabase/config.toml` since they're called anonymously
from the public pages.

Schema evolution: `eccia_masterclass_certificados` was created in
`20260703145000_add_masterclass_certificate_claims.sql` (name+email capture only) and extended in
`20260704120000_add_certificate_generation_flow.sql` (status machine, Nextcloud/Resend tracking columns).
Follow this pattern — additive `alter table ... add column if not exists` migrations — rather than
rewriting prior migrations.

### Security invariants (do not weaken)

- Public pages only ever use a Supabase **publishable key**; `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  / `SUPABASE_SECRET_KEYS`, and `NEXTCLOUD_*` credentials live only as Supabase Edge Function secrets.
- Edge Functions read the secret key via `SUPABASE_SECRET_KEYS` (JSON, `.default`) with fallback to
  `SUPABASE_SERVICE_ROLE_KEY` — keep both paths when touching this code.
- RLS restricts public roles to `insert` only, on an explicit column allow-list; never grant public
  `select`/`update`/`delete` on either table.
- Never mix "operational" emails (registration confirmation, reminders, certificate delivery — sent
  regardless of consent) with "promotional" emails (only sent to `marketing_consent = true` contacts via
  the Resend segment/topic). See `EMAIL_OPERATIONS.md` for the full rule.

### Brand

This project is bound to the Littus Brand Kit (`brand_id: eccia`). Before any frontend/CSS/HTML/visual
change, follow the resolution steps in `AGENTS.md` (resolve `LITTUS_BRAND_KIT`, read the brand manifest
and tokens) — do not invent colors, logos, typography, or copy.
