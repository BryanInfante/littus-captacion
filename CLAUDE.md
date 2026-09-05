# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static landing page + Supabase backend for ECCIA (Littus Group) workshop registration and certificate
issuance. No frontend framework, bundler, or build step — `public/` is plain HTML/CSS/JS served
directly (locally and via GitHub Pages). Backend logic lives in Supabase Edge Functions (Deno/TypeScript).

Read `README.md` for the operational runbook, `EMAIL_OPERATIONS.md` for Resend campaign procedures, and
`AGENTS.md` for mandatory brand rules before any visual change.

## Commands

There is no `package.json` / npm toolchain — do not introduce one without asking.

Serve the static site locally:
```powershell
npx serve public
```
(or just open `public/index.html` directly / use a Live Server extension).

Run tests (PowerShell 7+) — each file is an independent suite; run one by invoking it alone:
```powershell
.\tests\landing.tests.ps1              # index.html, styles, app.js, registration + reminder emails
.\tests\certificate-claim.tests.ps1    # regalos.html, certificados.js, claims migration, PDF downloads
.\tests\certificate-generation.tests.ps1  # issue/validate/download functions, config.toml, validar-certificado.html
```
If execution policy blocks the script or PowerShell 5 mis-decodes UTF-8, use the workaround documented
in `README.md` (`Pruebas` section) — it loads the script as a scriptblock with `$PSScriptRoot` rebound.

Tests are static assertion scripts: they read the relevant `public/`, `emails/`, and
`supabase/functions/**/index.ts` files as raw text and assert on required markers/strings (see
`Assert-Contains` in `tests/landing.tests.ps1`). There is no DOM/runtime execution — when adding a
feature, add matching string assertions to the suite that already owns those files rather than a JS
test runner. Note each suite pins its own file list at the top; adding a new file means adding its
`Join-Path` there too.

Deploy: GitHub Actions handle deployment on push to `main`. `pages.yml` publishes `public/` to GitHub
Pages. `deploy-supabase-functions.yml` deploys `issue-certificate` only, and only when files under
`supabase/functions/issue-certificate/**` or `supabase/config.toml` change — other Edge Functions
(`sync-resend-contact`, `send-registration-confirmation`, `send-workshop-reminder`,
`validate-certificate`, `download-certificate`) must be deployed manually via `supabase functions deploy
<name>` until a workflow is added for them.

`.mcp.json` wires the Supabase MCP server to project ref `qfbhyzynpyqqcpuuibod`. It can **deploy** Edge
Functions but cannot **delete** them — anything deployed through MCP has to be removed with the CLI
(`supabase functions delete <name> --project-ref ...`). See the "Funciones temporales" section of
`EMAIL_OPERATIONS.md`.

## Architecture

Two flows share the same Supabase project (`airen`), both driven by public forms that talk to Supabase
from the browser using a **publishable key** (never a secret/service-role key). The key and project URL
are hardcoded in `public/app.js` and `public/certificados.js` — that is intentional, not a leak.

**1. Workshop registration** (`public/index.html` + `public/app.js` → table
`eccia_taller_inscripciones`): browser inserts a row via PostgREST. Two DB triggers asynchronously invoke
`send-registration-confirmation` and `sync-resend-contact`. Both fire unconditionally — the consent gate
lives *inside* `sync-resend-contact`, which re-reads the row and short-circuits with
`{status: 'skipped', reason: 'no_consent'}` (`sync-resend-contact/index.ts:89`). Keep it there; do not
move consent logic into the trigger.

**This project was wiped on 2026-07-25 and is being rebuilt — read `RECOVERY.md` before touching
Supabase.** The schema now lives in `supabase/migrations/` in full, including the previously unversioned
table creation and trigger functions.

`app.js` has a `REGISTRATION_CLOSED` boolean at the top that disables the form without deleting it, and
a `META_PIXEL_ID` constant (`PageView` on load, `Lead` only after Supabase confirms the insert; empty
string disables tracking safely).

`send-workshop-reminder` is invoked manually, not by a trigger. It is gated: the payload needs
`mode: 'send'` **plus** the exact `APPROVAL_PHRASE` constant, otherwise it only returns a preview. Do not
weaken that gate.

**2. Certificate issuance** (`public/regalos.html` + `public/certificados.js` → `issue-certificate` Edge
Function): browser POSTs name+email to the function directly (not a DB insert). The two flows are
**coupled**: `issue-certificate` first looks the email up in `eccia_taller_inscripciones` and returns
403 if there is no matching registration. Certificates are only for people who registered.

The function then:
- normalizes input, generates a unique `codigo_certificado` (`ECCIA-UT1-XXXXXXXX`),
- renders a PDF with `pdf-lib` + `fontkit` (fonts fetched at runtime from Google Fonts) and a QR code
  (`npm:qrcode`) pointing at `validar-certificado.html?code=...`,
- uploads the PDF to Nextcloud over WebDAV and stores the resulting `nextcloud_path`,
- emails the download/validation links via Resend,
- tracks progress through `certificate_status`: `pending → rendering → uploaded → emailed` (or `failed`,
  with `certificate_error`/`certificate_attempts`).

`validate-certificate` (public GET by `code`) reports validity plus display metadata.
`download-certificate` (public GET by `code`) proxies the PDF bytes from Nextcloud (only for
`uploaded`/`emailed` status) so WebDAV credentials never reach the browser. Those two plus
`issue-certificate` have `verify_jwt = false` in `supabase/config.toml` since the public pages call them
anonymously.

### Certificate gotchas

- **`public/certificado.html` and `public/certificado_variante_blanca.html` are not live pages** — they
  are static design references for the PDF layout (inline `<style>`, no form, no JS). The PDF geometry in
  `issue-certificate/index.ts` (`buildLayout()`, `htmlMm()`) mirrors those mockups in millimeters. Change
  the mockup and the layout function together, or they drift.
- **Font URLs are pinned to static per-weight files** on `fonts.gstatic.com`, not variable fonts and not
  the google/fonts source repo. `@pdf-lib/fontkit` silently drops most glyphs when subsetting Inter's
  variable font. The comment above those constants explains it — do not "modernize" the URLs.
- **Stale-render recovery**: a claim stuck in `rendering` for more than `RENDERING_STALE_MS` (2 min) is
  treated as a crashed attempt and retried, because a platform-level crash skips the `try/catch` that
  would otherwise demote it to `failed`.

### Edge Function secrets

`RESEND_API_KEY`, `NEXTCLOUD_WEBDAV_URL` / `NEXTCLOUD_USERNAME` / `NEXTCLOUD_APP_PASSWORD`, and
`CERTIFICATE_PUBLIC_BASE_URL` (the public origin used to build validation URLs). Read via
`requiredEnv()`, which throws when missing.

Schema evolution: `eccia_masterclass_certificados` was created in
`20260703145000_add_masterclass_certificate_claims.sql`, extended in
`20260704120000_add_certificate_generation_flow.sql` (status machine, Nextcloud/Resend tracking) and
`20260705200000_add_certificate_rendering_started_at.sql`. Follow this pattern — additive
`alter table ... add column if not exists` migrations — rather than rewriting prior migrations.

### Security invariants (do not weaken)

- Public pages only ever use a Supabase **publishable key**; `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  / `SUPABASE_SECRET_KEYS`, and `NEXTCLOUD_*` credentials live only as Supabase Edge Function secrets.
- Edge Functions read the secret key via `getSecretKey()`: `SUPABASE_SECRET_KEYS` (JSON, `.default`) with
  fallback to `SUPABASE_SERVICE_ROLE_KEY` — keep both paths when touching this code.
- RLS restricts public roles to `insert` only, on an explicit column allow-list; never grant public
  `select`/`update`/`delete` on either table.
- Never mix "operational" emails (registration confirmation, reminders, certificate delivery — sent
  regardless of consent) with "promotional" emails (only sent to `marketing_consent = true` contacts via
  the Resend segment/topic). Promotional sends go through the Resend **Broadcasts API** with a
  `segment_id`, never the raw `/emails` endpoint — only Broadcasts resolve
  `{{{RESEND_UNSUBSCRIBE_URL}}}`. See `EMAIL_OPERATIONS.md` for the full rule.

### Brand

This project is bound to the Littus Brand Kit (`brand_id: eccia`). Before any frontend/CSS/HTML/visual
change, follow the resolution steps in `AGENTS.md` (resolve `LITTUS_BRAND_KIT`, read the brand manifest
and tokens) — do not invent colors, logos, typography, or copy. Locally, the applied tokens live in
`public/brand/tokens.css` and `public/brand/components.css`; every page loads `tokens.css` first.
