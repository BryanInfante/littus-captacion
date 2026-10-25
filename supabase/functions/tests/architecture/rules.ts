import {
  classifySpecifier,
  isExactVersionSpecifier,
  isSupabaseClientSpecifier,
  resolvesInside,
  scanSource,
  type SourceFacts,
} from "./scanner.ts";

// Paths are relative to `supabase/functions/` with `/` separators.
export type SourceFile = { readonly path: string; readonly source: string };

export type Violation = {
  readonly path: string;
  readonly line: number;
  readonly detail: string;
};

export type Rule = {
  readonly name: string;
  readonly check: (path: string, facts: SourceFacts) => Violation[];
  readonly checkAll?: (files: readonly ScannedFile[]) => Violation[];
};

const DEPS = "_shared/deps.ts";
const DEV_DEPS = "tests/dev_deps.ts";
const SUPABASE_ADAPTER = "_shared/adapters/supabase/";
const CONFIG = "_shared/config.ts";
const LOG = "_shared/log.ts";
const DOMAIN = "_shared/domain/";

const COMPUTED = "computed dynamic import";

export const thirdPartyOutsideDeps: Rule = {
  name: "third-party specifiers only in _shared/deps.ts or tests/dev_deps.ts",
  check: (path, facts) =>
    path === DEPS || path === DEV_DEPS
      ? []
      : facts.moduleReferences.flatMap(({ line, specifier }) =>
        specifier === null
          ? [{ path, line, detail: COMPUTED }]
          : classifySpecifier(specifier) === "third-party"
          ? [{ path, line, detail: specifier }]
          : []
      ),
};

export const depsPinExactVersions: Rule = {
  name: "dependency files pin every third-party specifier to an exact version",
  check: (path, facts) =>
    path !== DEPS && path !== DEV_DEPS
      ? []
      : facts.moduleReferences.flatMap(({ line, specifier }) =>
        specifier === null
          ? [{ path, line, detail: COMPUTED }]
          : classifySpecifier(specifier) === "third-party" &&
              !isExactVersionSpecifier(specifier)
          ? [{ path, line, detail: specifier }]
          : []
      ),
};

const packageKey = (specifier: string): string | null => {
  const schemeMatch = /^(npm|jsr):\/?(.+)$/.exec(specifier);
  if (schemeMatch === null) return null;
  const [, scheme, rest] = schemeMatch;
  const packagePath = rest.startsWith("@")
    ? rest.split("/").slice(0, 2).join("/")
    : rest.split("/")[0];
  const packageName = packagePath.replace(/@\d+.*$/, "");
  return packageName.length === 0 ? null : `${scheme}:${packageName}`;
};

const namedReexports = (
  source: string,
): readonly { name: string; line: number }[] => {
  const exports: { name: string; line: number }[] = [];
  const declaration = /export\s*\{([^}]*)\}\s*from\s*(["'])([^"']+)\2/g;
  for (const match of source.matchAll(declaration)) {
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    for (const entry of match[1].split(",")) {
      const parts = entry.trim().split(/\s+as\s+/);
      const name = parts.at(-1)?.trim();
      if (name !== undefined && name.length > 0) exports.push({ name, line });
    }
  }
  return exports;
};

const namedImportsFromDeps = (
  path: string,
  source: string,
): readonly { name: string; line: number }[] => {
  const imports: { name: string; line: number }[] = [];
  const declaration =
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\2/g;
  for (const match of source.matchAll(declaration)) {
    if (!resolvesTo(path, match[3], DEPS)) {
      continue;
    }
    const line = source.slice(0, match.index ?? 0).split("\n").length;
    for (const entry of match[1].split(",")) {
      const parts = entry.trim().split(/\s+as\s+/);
      const name = parts[0]?.trim();
      if (name !== undefined && name.length > 0) imports.push({ name, line });
    }
  }
  return imports;
};

export const dependencyPackagesDoNotOverlap: Rule = {
  name: "dependency files do not contain the same package",
  check: () => [],
  checkAll: (files) => {
    const fileByPath = new Map(files.map((file) => [file.path, file]));
    const deps = fileByPath.get(DEPS);
    const devDeps = fileByPath.get(DEV_DEPS);
    if (deps === undefined || devDeps === undefined) return [];
    const packages = (file: ScannedFile) =>
      file.facts.moduleReferences.flatMap(
        ({ line, specifier }) =>
          specifier !== null &&
            classifySpecifier(specifier) === "third-party"
            ? [{ key: packageKey(specifier), line, specifier }]
            : [],
      );
    const devPackages = new Set(packages(devDeps).map(({ key }) => key));
    return packages(deps).flatMap(({ key, line, specifier }) =>
      key !== null && devPackages.has(key)
        ? [{
          path: DEPS,
          line,
          detail: `${specifier} also appears in ${DEV_DEPS}`,
        }]
        : []
    );
  },
};

const resolvesTo = (
  importer: string,
  specifier: string,
  target: string,
): boolean => {
  if (!specifier.startsWith(".")) return false;
  const segments = importer.split("/").slice(0, -1);
  for (const segment of specifier.split(/[?#]/)[0].split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/") === target;
};

export const devDepsOnlyInTests: Rule = {
  name: "tests/dev_deps.ts is imported only from tests/",
  check: (path, facts) =>
    path.startsWith("tests/") || path === DEV_DEPS
      ? []
      : facts.moduleReferences.flatMap(({ line, specifier }) =>
        specifier !== null && resolvesTo(path, specifier, DEV_DEPS)
          ? [{ path, line, detail: specifier }]
          : []
      ),
};

export const depsExportsUsedByFunctions: Rule = {
  name: "every _shared/deps.ts export is used outside tests through deps.ts",
  check: () => [],
  checkAll: (files) => {
    const deps = files.find(({ path }) => path === DEPS);
    if (deps === undefined) return [];
    const exported = namedReexports(deps.source).map(({ name, line }) => ({
      name,
      line,
    }));
    const imported = new Set(
      files
        .filter(({ path }) => !path.startsWith("tests/") && path !== DEPS)
        .flatMap(({ path, source }) =>
          namedImportsFromDeps(path, source).map(({ name }) => name)
        ),
    );
    return exported.flatMap(({ name, line }) =>
      imported.has(name) ? [] : [{
        path: DEPS,
        line,
        detail: `${name} has no importer outside tests/`,
      }]
    );
  },
};

// deps.ts is exempt because it must re-export supabase-js (it owns every
// version); only the adapter may import that re-export.
export const supabaseClientOnlyInAdapter: Rule = {
  name:
    "Supabase client imported or created only in _shared/adapters/supabase/",
  check: (path, facts) =>
    path === DEPS || path.startsWith(SUPABASE_ADAPTER) ? [] : [
      ...facts.moduleReferences
        .filter(({ specifier }) =>
          specifier !== null && isSupabaseClientSpecifier(specifier)
        )
        .map(({ line, specifier }) => ({
          path,
          line,
          detail: specifier ?? COMPUTED,
        })),
      ...facts.createClientUse.map(({ line, detail }) => ({
        path,
        line,
        detail,
      })),
    ],
};

export const envOnlyInConfig: Rule = {
  name: "Deno.env only in _shared/config.ts",
  check: (path, facts) =>
    path === CONFIG
      ? []
      : facts.envAccess.map(({ line, detail }) => ({ path, line, detail })),
};

export const consoleOnlyInLog: Rule = {
  name: "console only in _shared/log.ts",
  check: (path, facts) =>
    path === LOG
      ? []
      : facts.consoleUse.map(({ line, detail }) => ({ path, line, detail })),
};

export const domainImportsStayInDomain: Rule = {
  name: "_shared/domain/ imports only from _shared/domain/",
  check: (path, facts) =>
    !path.startsWith(DOMAIN)
      ? []
      : facts.moduleReferences.flatMap(({ line, specifier }) =>
        specifier !== null && resolvesInside(path, specifier, DOMAIN)
          ? []
          : [{ path, line, detail: specifier ?? COMPUTED }]
      ),
};

// A function may import its own files and _shared/, never another function's
// directory: the shared code goes to _shared/ (CLAUDE.md, "Extend, do not copy").
const SHARED_ROOT = "_shared";
const TESTS_ROOT = "tests";

export const noCrossFunctionImports: Rule = {
  name: "a function imports only its own files and _shared/",
  check: (path, facts) => {
    const [own, ...rest] = path.split("/");
    if (rest.length === 0 || own === SHARED_ROOT || own === TESTS_ROOT) {
      return [];
    }
    return facts.moduleReferences.flatMap(({ line, specifier }) => {
      if (specifier === null || !specifier.startsWith(".")) return [];
      const resolved = new URL(specifier, `file:///${path}`).pathname.slice(1);
      const target = resolved.split("/")[0];
      return target === own || target === SHARED_ROOT
        ? []
        : [{ path, line, detail: specifier }];
    });
  },
};

// Settings that bind a page to the deployed backend. Pages and the api client
// import them from one module, so rotating a key or moving the project is a
// one-line change. Paths are relative to the repository root. The patterns
// match any project or key, not only today's values, so a second project URL
// or key cannot slip in either.
export const PUBLIC_SETTINGS_SOURCE = "public/js/core/config.js";

const PUBLIC_SETTINGS: readonly { name: string; pattern: RegExp }[] = [
  { name: "Supabase project URL", pattern: /\b[a-z0-9]{20}\.supabase\.co\b/ },
  {
    name: "Supabase publishable key",
    pattern: /\bsb_publishable_[A-Za-z0-9_-]+/,
  },
  { name: "Turnstile site key", pattern: /\b0x4[A-Za-z0-9_-]{18,}/ },
];

export const publicSettingsOutsideSource = (
  files: readonly SourceFile[],
): Violation[] =>
  files.flatMap(({ path, source }) =>
    path === PUBLIC_SETTINGS_SOURCE ? [] : source.split("\n").flatMap(
      (text, index) =>
        PUBLIC_SETTINGS
          .filter(({ pattern }) => pattern.test(text))
          .map(({ name }) => ({ path, line: index + 1, detail: name })),
    )
  );

// Only the Resend adapter knows the provider host, so a second caller cannot
// bypass the Mailer port or reach the promotional endpoints by hand. Raw text,
// like the public settings rule: the host is a string, not a syntax fact.
const RESEND_ADAPTER = "_shared/adapters/resend/";
const RESEND_HOST = /api\.resend\.com/i;

export const resendHostOutsideAdapter = (
  files: readonly SourceFile[],
): Violation[] =>
  files.flatMap(({ path, source }) =>
    path.startsWith(RESEND_ADAPTER) ? [] : source.split("\n").flatMap(
      (text, index) =>
        RESEND_HOST.test(text)
          ? [{ path, line: index + 1, detail: "Resend API host" }]
          : [],
    )
  );

export type RatchetResult = {
  // Violations in files that are not on the legacy list: new code broke the rule.
  readonly unlisted: readonly string[];
  // Legacy entries that no longer violate the rule: the list must shrink.
  readonly stale: readonly string[];
};

export type ScannedFile = {
  readonly path: string;
  readonly source: string;
  readonly facts: SourceFacts;
};

export const scanFiles = (files: readonly SourceFile[]): ScannedFile[] =>
  files.map(({ path, source }) => ({
    path,
    source,
    facts: scanSource(path, source),
  }));

export const ratchet = (
  rule: Rule,
  files: readonly ScannedFile[],
  legacyPaths: readonly string[],
): RatchetResult =>
  ratchetViolations([
    ...files.flatMap(({ path, facts }) => rule.check(path, facts)),
    ...(rule.checkAll?.(files) ?? []),
  ], legacyPaths);

export const ratchetViolations = (
  violations: readonly Violation[],
  legacyPaths: readonly string[],
): RatchetResult => {
  const violating = new Set(violations.map(({ path }) => path));
  return {
    unlisted: violations
      .filter(({ path }) => !legacyPaths.includes(path))
      .map(({ path, line, detail }) => `${path}:${line} ${detail}`),
    stale: legacyPaths.filter((path) => !violating.has(path)),
  };
};
