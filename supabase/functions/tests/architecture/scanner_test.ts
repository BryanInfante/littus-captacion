import { assertEquals, assertThrows } from "../dev_deps.ts";
import {
  consoleOnlyInLog,
  depsPinExactVersions,
  domainImportsStayInDomain,
  envOnlyInConfig,
  ratchet,
  type Rule,
  scanFiles,
  supabaseClientOnlyInAdapter,
  thirdPartyOutsideDeps,
} from "./rules.ts";
import {
  classifySpecifier,
  isExactVersionSpecifier,
  isSupabaseClientSpecifier,
  resolvesInside,
  scanSource,
} from "./scanner.ts";

const specifiers = (source: string): (string | null)[] =>
  scanSource("fixture.ts", source).moduleReferences.map((reference) =>
    reference.specifier
  );

const lines = (findings: readonly { line: number }[]): number[] =>
  findings.map(({ line }) => line);

Deno.test("scanner finds every module reference form", () => {
  const source = [
    '/// <reference types="npm:@types/triple@1.0.0" />',
    'import type { Thing } from "./types.ts";',
    'import "jsr:@scope/side-effect@1.0.0";',
    'export { value } from "jsr:@scope/reexport@4.5.6";',
    'export * from "npm:star@1.0.0";',
    'const dynamic = await import("npm:dynamic@2.3.4");',
    "const template = await import(`npm:no-substitution@1.0.0`);",
    'type Lazy = typeof import("npm:type-only@1.0.0");',
    'import legacy = require("npm:import-equals@1.0.0");',
    '// @deno-types="npm:@types/pragma@1.0.0"',
    'import pragma from "npm:pragma@1.0.0";',
  ].join("\n");
  assertEquals(specifiers(source), [
    "npm:@types/triple@1.0.0",
    "npm:@types/pragma@1.0.0",
    "./types.ts",
    "jsr:@scope/side-effect@1.0.0",
    "jsr:@scope/reexport@4.5.6",
    "npm:star@1.0.0",
    "npm:dynamic@2.3.4",
    "npm:no-substitution@1.0.0",
    "npm:type-only@1.0.0",
    "npm:import-equals@1.0.0",
    "npm:pragma@1.0.0",
  ]);
});

Deno.test("scanner ignores lookalikes in text and member calls named import", () => {
  const source = [
    '// import "npm:line-comment@1.0.0";',
    '/* import("npm:block-comment@1.0.0") */',
    "const quoted = \"export { x } from 'npm:quoted@1.0.0'\";",
    "const text = `import('npm:template-text@1.0.0')`;",
    'const pattern = /import\\("npm:regex@1.0.0"\\)/;',
    "const ratio = total / count / 2;",
    'loader.import("npm:member-call@1.0.0");',
    'const meta = import.meta.resolve("npm:meta@1.0.0");',
  ].join("\n");
  assertEquals(specifiers(source), []);
});

Deno.test("scanner visits code inside template interpolations", () => {
  const source = [
    'const html = `<p>${(await import("npm:interpolated@1.0.0")).x}</p>`;',
    'const nested = `a ${`b ${Deno.env.get("NESTED")}`}`;',
    "const logged = `${console.log(1)}`;",
  ].join("\n");
  const facts = scanSource("fixture.ts", source);
  assertEquals(specifiers(source), ["npm:interpolated@1.0.0"]);
  assertEquals(lines(facts.envAccess), [2]);
  assertEquals(lines(facts.consoleUse), [3]);
});

Deno.test("scanner decodes escaped specifiers and flags computed ones", () => {
  const source = [
    'import a from "npm\\u003Aunicode-escape@1.0.0";',
    'import b from "\\x6epm:hex-escape@1.0.0";',
    'import c from "npm:line-\\',
    'continuation@1.0.0";',
    "const name = 'npm:x@1.0.0';",
    "await import(name);",
    "await import(`npm:${name}`);",
  ].join("\n");
  assertEquals(specifiers(source), [
    "npm:unicode-escape@1.0.0",
    "npm:hex-escape@1.0.0",
    "npm:line-continuation@1.0.0",
    null,
    null,
  ]);
});

Deno.test("scanner flags every way to reach Deno.env", () => {
  const source = [
    'Deno.env.get("A");',
    'Deno?.env.get("B");',
    'Deno["env"].get("C");',
    "Deno[key];",
    'globalThis.Deno.env.get("E");',
    "const alias = Deno;",
    "const { env } = Deno;",
    'const { ["env"]: renamed } = Deno;',
    "const { ...everything } = Deno;",
    "read(Deno);",
    '(Deno as typeof Deno).env.get("K");',
  ].join("\n");
  assertEquals(
    lines(scanSource("fixture.ts", source).envAccess),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
});

Deno.test("scanner allows Deno uses that cannot reach env", () => {
  const source = [
    '// Deno.env.get("COMMENT");',
    "const text = \"Deno.env.get('STRING')\";",
    "Deno.serve(handler);",
    "const { serve, readFile } = Deno;",
    'if (typeof Deno !== "undefined") run();',
    "type Kv = Deno.Kv;",
    "type Env = typeof Deno.env;",
    "other.Deno.env.get('MEMBER');",
    "const shape = { Deno: 1, env: 2 };",
  ].join("\n");
  assertEquals(scanSource("fixture.ts", source).envAccess, []);
});

Deno.test("scanner flags console use and ignores lookalikes", () => {
  const source = [
    'console.log("a");',
    'console?.warn("b");',
    'console["info"]("c");',
    'globalThis.console.error("d");',
    "const log = console.log;",
    "const sink = { console };",
    "// console.log('comment');",
    "const text = 'console.log()';",
    "other.console.log('member');",
    "type Sink = typeof console;",
    "const shape = { console: 1 };",
  ].join("\n");
  assertEquals(lines(scanSource("fixture.ts", source).consoleUse), [
    1,
    2,
    3,
    4,
    5,
    6,
  ]);
});

Deno.test("scanner flags createClient under any alias or access", () => {
  const source = [
    'import { createClient as make } from "./deps.ts";',
    'export { createClient } from "./deps.ts";',
    "const client = deps.createClient(url, key);",
    'const other = deps["createClient"](url, key);',
    "const { createClient: build } = deps;",
    "// createClient(url, key);",
    "const text = 'createClient';",
  ].join("\n");
  assertEquals(
    lines(scanSource("fixture.ts", source).createClientUse),
    [1, 2, 3, 4, 5],
  );
});

Deno.test("scanner refuses files it cannot parse", () => {
  assertThrows(
    () => scanSource("broken.ts", "import { from 'npm:x@1.0.0'"),
    Error,
    "broken.ts: cannot be parsed",
  );
});

Deno.test("exact versions accept subpaths and reject ranges and tags", () => {
  const exact = [
    "npm:pdf-lib@1.17.1",
    "npm:@scope/package@1.2.3",
    "npm:@pdf-lib/fontkit@1.1.1/dist/fontkit.es.js",
    "npm:package@1.0.0-rc.1",
    "jsr:@std/assert@1.0.19",
    "jsr:@std/http@1.1.4/file-server",
  ];
  const inexact = [
    "npm:package",
    "npm:package@1",
    "npm:package@1.2",
    "npm:package@1.2.x",
    "npm:package@^1.2.3",
    "npm:package@~1.2.3",
    "npm:package@>=1.2.3",
    "npm:package@1.2.3 || 2.0.0",
    "npm:package@latest",
    "npm:@supabase/supabase-js@2",
    "jsr:@std/http/file-server",
    "https://esm.sh/package@1.2.3",
  ];
  assertEquals(exact.filter(isExactVersionSpecifier), exact);
  assertEquals(inexact.filter(isExactVersionSpecifier), []);
});

Deno.test("specifier helpers classify, match supabase-js and resolve paths", () => {
  assertEquals(
    ["./a.ts", "../b.ts", "node:fs", "npm:x@1.0.0", "lodash", "https://x.test"]
      .map(classifySpecifier),
    [
      "relative",
      "relative",
      "builtin",
      "third-party",
      "third-party",
      "third-party",
    ],
  );
  assertEquals(
    [
      "npm:@supabase/supabase-js@2",
      "jsr:@supabase/supabase-js@2.50.0",
      "https://esm.sh/@supabase/supabase-js@2",
      "@supabase/supabase-js",
      "jsr:@supabase/functions-js/edge-runtime.d.ts",
      "npm:@supabase/supabase-jsx@1.0.0",
    ].map(isSupabaseClientSpecifier),
    [true, true, true, true, false, false],
  );
  const domain = "_shared/domain/";
  const importer = "_shared/domain/event.ts";
  assertEquals(
    [
      "./code.ts",
      "./rules/state.ts",
      "../domain/code.ts",
      "../ports/events.ts",
      "../../../../../escape.ts",
      "npm:x@1.0.0",
    ].map((specifier) => resolvesInside(importer, specifier, domain)),
    [true, true, true, false, false, false],
  );
});

const fixtureFiles = scanFiles([
  { path: "_shared/deps.ts", source: 'export { x } from "npm:x@^1.0.0";' },
  {
    path: "tests/dev_deps.ts",
    source: 'export { y } from "npm:test-only@latest";',
  },
  {
    path: "_shared/adapters/supabase/client.ts",
    source: 'import { createClient } from "../../deps.ts";',
  },
  { path: "_shared/config.ts", source: 'Deno.env.get("A");' },
  { path: "_shared/log.ts", source: "console.log(1);" },
  {
    path: "_shared/domain/event.ts",
    source: 'import "./code.ts"; import "../ports/events.ts";',
  },
  {
    path: "feature/index.ts",
    source: [
      'import { createClient } from "npm:@supabase/supabase-js@2";',
      'Deno.env.get("B");',
      "console.error(2);",
    ].join("\n"),
  },
]);

Deno.test("rules exempt only their owning module", () => {
  const unlisted = (rule: Rule): readonly string[] =>
    ratchet(rule, fixtureFiles, []).unlisted;
  assertEquals(unlisted(thirdPartyOutsideDeps), [
    "feature/index.ts:1 npm:@supabase/supabase-js@2",
  ]);
  assertEquals(unlisted(depsPinExactVersions), [
    "_shared/deps.ts:1 npm:x@^1.0.0",
    "tests/dev_deps.ts:1 npm:test-only@latest",
  ]);
  assertEquals(unlisted(supabaseClientOnlyInAdapter), [
    "feature/index.ts:1 npm:@supabase/supabase-js@2",
    "feature/index.ts:1 createClient",
  ]);
  assertEquals(unlisted(envOnlyInConfig), ["feature/index.ts:2 Deno.env"]);
  assertEquals(unlisted(consoleOnlyInLog), ["feature/index.ts:3 console"]);
  assertEquals(unlisted(domainImportsStayInDomain), [
    "_shared/domain/event.ts:1 ../ports/events.ts",
  ]);
});

Deno.test("ratchet reports unlisted violations and stale legacy entries", () => {
  assertEquals(
    ratchet(envOnlyInConfig, fixtureFiles, [
      "feature/index.ts",
      "_shared/log.ts",
      "removed/index.ts",
    ]),
    { unlisted: [], stale: ["_shared/log.ts", "removed/index.ts"] },
  );
});
