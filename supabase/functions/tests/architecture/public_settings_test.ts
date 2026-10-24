import { assertEquals } from "../dev_deps.ts";
import {
  PUBLIC_SETTINGS_SOURCE,
  publicSettingsOutsideSource,
  ratchetViolations,
  type SourceFile,
} from "./rules.ts";

// Paths are relative to the repository root, with `/` separators.
const PUBLIC_ROOT = new URL("../../../../public/", import.meta.url);
// Binary assets (images, PDFs, icons) cannot hold a setting a page reads.
const TEXT_FILE = /\.(html?|[cm]?js|css|json|txt|xml|svg|webmanifest)$/i;

const readTextFiles = async (
  directory: URL,
  prefix: string,
): Promise<SourceFile[]> => {
  const files: SourceFile[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) {
      files.push(
        ...await readTextFiles(
          new URL(`${encodeURIComponent(entry.name)}/`, directory),
          `${path}/`,
        ),
      );
    } else if (entry.isFile && TEXT_FILE.test(entry.name)) {
      const source = await Deno.readTextFile(
        new URL(encodeURIComponent(entry.name), directory),
      );
      files.push({ path, source });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
};

// Pages written before public/js/core/ inline the Supabase URL and the
// publishable key. Do not add entries; remove each one when its page moves to
// the api client (FN-02-10 for the landing, F4 for the certificate pages).
const LEGACY_PUBLIC_SETTINGS = [
  "public/app.js",
  "public/certificados.js",
  "public/validar-certificado.html",
];

Deno.test("backend settings appear in public/ only in public/js/core/config.js", async () => {
  const files = await readTextFiles(PUBLIC_ROOT, "public/");
  assertEquals(
    ratchetViolations(
      publicSettingsOutsideSource(files),
      LEGACY_PUBLIC_SETTINGS,
    ),
    { unlisted: [], stale: [] },
    'fix "unlisted"; delete "stale" entries from the legacy list',
  );
  assertEquals(
    files.some(({ path }) => path === PUBLIC_SETTINGS_SOURCE),
    true,
    `${PUBLIC_SETTINGS_SOURCE} must exist`,
  );
});

Deno.test("the public settings rule flags every setting outside the config module", () => {
  const files: SourceFile[] = [
    {
      path: "public/js/core/config.js",
      source: [
        'export const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";',
        'export const KEY = "sb_publishable_AbC-123_x";',
        'export const SITE_KEY = "0x4AAAAAAFkQkWGC4HttCEQB";',
      ].join("\n"),
    },
    {
      path: "public/js/core/api.js",
      source: 'fetch("https://abcdefghijklmnopqrst.supabase.co/rest/v1/x");',
    },
    {
      path: "public/page.html",
      source:
        '<div data-sitekey="0x4AAAAAAFkQkWGC4HttCEQB"></div>\n<script>const k = "sb_publishable_AbC";</script>',
    },
    {
      path: "public/clean.js",
      source: 'import { SUPABASE_URL } from "./js/core/config.js";',
    },
  ];
  assertEquals(
    ratchetViolations(publicSettingsOutsideSource(files), ["public/clean.js"]),
    {
      unlisted: [
        "public/js/core/api.js:1 Supabase project URL",
        "public/page.html:1 Turnstile site key",
        "public/page.html:2 Supabase publishable key",
      ],
      stale: ["public/clean.js"],
    },
  );
});
