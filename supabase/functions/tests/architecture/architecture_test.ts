import { assertEquals } from "../dev_deps.ts";
import {
  consoleOnlyInLog,
  dependencyPackagesDoNotOverlap,
  depsExportsUsedByFunctions,
  depsPinExactVersions,
  devDepsOnlyInTests,
  domainImportsStayInDomain,
  envOnlyInConfig,
  ratchet,
  type Rule,
  scanFiles,
  type ScannedFile,
  type SourceFile,
  supabaseClientOnlyInAdapter,
  thirdPartyOutsideDeps,
} from "./rules.ts";

// Static scan of every module under supabase/functions/, tests included: test
// code follows the same rules (the database suite must not read its target
// from the environment, and suites report through `deno test`, not console).
const FUNCTIONS_ROOT = new URL("../../", import.meta.url);
const MODULE_FILE = /\.[cm]?[jt]sx?$/;

const readModules = async (
  directory: URL,
  prefix: string,
): Promise<SourceFile[]> => {
  const files: SourceFile[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) {
      files.push(
        ...await readModules(
          new URL(`${encodeURIComponent(entry.name)}/`, directory),
          `${path}/`,
        ),
      );
    } else if (entry.isFile && MODULE_FILE.test(entry.name)) {
      const source = await Deno.readTextFile(
        new URL(encodeURIComponent(entry.name), directory),
      );
      files.push({ path, source });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
};

const files: readonly ScannedFile[] = scanFiles(
  await readModules(FUNCTIONS_ROOT, ""),
);

// Legacy lists may only shrink: the test fails when a file outside the list
// breaks the rule and when a listed file no longer breaks it.
const assertRatchet = (rule: Rule, legacyPaths: readonly string[]): void => {
  assertEquals(
    ratchet(rule, files, legacyPaths),
    { unlisted: [], stale: [] },
    `${rule.name}: fix "unlisted"; delete "stale" entries from the legacy list`,
  );
};

// The seven legacy functions predate deps.ts, the adapters, config.ts and
// log.ts. Do not add entries; remove each one when its file migrates (F2-F5).
const LEGACY_FUNCTIONS = [
  "download-certificate/index.ts",
  "issue-certificate/index.ts",
  "send-course-access/index.ts",
  "send-registration-confirmation/index.ts",
  "send-workshop-reminder/index.ts",
  "sync-resend-contact/index.ts",
  "validate-certificate/index.ts",
] as const;

// Inline `jsr:@supabase/functions-js/edge-runtime.d.ts` and
// `npm:@supabase/supabase-js@2` in all seven; issue-certificate also imports
// unpinned `npm:pdf-lib`, `npm:@pdf-lib/fontkit` and `npm:qrcode`.
const LEGACY_THIRD_PARTY: readonly string[] = LEGACY_FUNCTIONS;

// Each one imports supabase-js and calls `createClient` itself.
const LEGACY_SUPABASE_CLIENT: readonly string[] = LEGACY_FUNCTIONS;

// Each one reads its secrets and settings with `Deno.env.get`.
const LEGACY_ENV: readonly string[] = LEGACY_FUNCTIONS;

// `console.error`/`console.log`; issue-certificate:821 logs a whole error
// object (known debt in CLAUDE.md).
const LEGACY_CONSOLE: readonly string[] = [
  "issue-certificate/index.ts",
];

Deno.test("third-party specifiers live only in dependency files", () => {
  assertRatchet(thirdPartyOutsideDeps, LEGACY_THIRD_PARTY);
});

Deno.test("dependency files pin every specifier to an exact version", () => {
  assertRatchet(depsPinExactVersions, []);
});

Deno.test("repository dependency files do not duplicate packages", () => {
  assertRatchet(dependencyPackagesDoNotOverlap, []);
});

Deno.test("repository dev_deps.ts imports stay in tests", () => {
  assertRatchet(devDepsOnlyInTests, []);
});

Deno.test("every runtime dependency export is used outside tests", () => {
  assertRatchet(depsExportsUsedByFunctions, []);
});

Deno.test("dependency files do not duplicate packages", () => {
  const files = scanFiles([
    {
      path: "_shared/deps.ts",
      source: 'export { a } from "npm:@scope/pkg@1.0.0/one";',
    },
    {
      path: "tests/dev_deps.ts",
      source: 'export { b } from "npm:@scope/pkg@2.0.0/two";',
    },
  ]);
  assertEquals(ratchet(dependencyPackagesDoNotOverlap, files, []), {
    unlisted: [
      "_shared/deps.ts:1 npm:@scope/pkg@1.0.0/one also appears in tests/dev_deps.ts",
    ],
    stale: [],
  });
});

Deno.test("dev_deps.ts cannot be imported outside tests", () => {
  const files = scanFiles([
    {
      path: "feature/index.ts",
      source: 'import { fixture } from "../tests/dev_deps.ts";',
    },
    {
      path: "tests/example_test.ts",
      source: 'import { fixture } from "./dev_deps.ts";',
    },
  ]);
  assertEquals(ratchet(devDepsOnlyInTests, files, []), {
    unlisted: ["feature/index.ts:1 ../tests/dev_deps.ts"],
    stale: [],
  });
});

Deno.test("every runtime dependency export is used outside tests", () => {
  const files = scanFiles([
    {
      path: "_shared/deps.ts",
      source: 'export { parse as parser } from "npm:parser@1.0.0";',
    },
    {
      path: "tests/fixture_test.ts",
      source: 'import { parser } from "../dev_deps.ts";',
    },
  ]);
  assertEquals(ratchet(depsExportsUsedByFunctions, files, []), {
    unlisted: ["_shared/deps.ts:1 parser has no importer outside tests/"],
    stale: [],
  });
});

Deno.test("Supabase client lives only in _shared/adapters/supabase/", () => {
  assertRatchet(supabaseClientOnlyInAdapter, LEGACY_SUPABASE_CLIENT);
});

Deno.test("Deno.env is read only in _shared/config.ts", () => {
  assertRatchet(envOnlyInConfig, LEGACY_ENV);
});

Deno.test("console is used only in _shared/log.ts", () => {
  assertRatchet(consoleOnlyInLog, LEGACY_CONSOLE);
});

Deno.test("_shared/domain/ imports nothing outside domain", () => {
  assertRatchet(domainImportsStayInDomain, []);
});
