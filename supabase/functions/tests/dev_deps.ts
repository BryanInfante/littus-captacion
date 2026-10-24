// The only module with test-only third-party specifiers. Every version is
// exact and lives here; deployed code never imports this file, so test tooling
// never reaches a function bundle. Runtime dependencies live in
// `_shared/deps.ts`, and no package may appear in both files.

export {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.19";
export { parse as babelParse } from "npm:@babel/parser@7.29.9";
// Fake DOM for the pure view modules of public/js/ (no browser in tests).
export { parseHTML } from "npm:linkedom@0.18.13";
export { default as postgres } from "npm:postgres@3.4.9";
export { parse as parseToml } from "jsr:@std/toml@1.0.11";
export { parse as parseYaml } from "jsr:@std/yaml@1.3.0";
