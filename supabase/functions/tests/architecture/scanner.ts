import { babelParse } from "../dev_deps.ts";

// Facts come from the syntax tree, never from raw text: strings, comments,
// regular expressions and template text cannot fake a match, escapes are
// decoded by the parser, and code inside `${...}` is visited like any other
// code. The TypeScript compiler API is not used because its npm build reads
// `process.env` when it loads, which would force `--allow-env` on every test
// task that imports `tests/dev_deps.ts`.

export type Finding = { readonly line: number; readonly detail: string };

export type ModuleReference = {
  readonly line: number;
  // null when the specifier is computed at runtime (`import(name)`): no static
  // rule can prove where it points, so every rule treats it as a violation.
  readonly specifier: string | null;
};

export type SourceFacts = {
  readonly moduleReferences: readonly ModuleReference[];
  readonly envAccess: readonly Finding[];
  readonly consoleUse: readonly Finding[];
  readonly createClientUse: readonly Finding[];
};

type SyntaxNode = { readonly type: string; readonly [key: string]: unknown };

type Context = {
  readonly parent?: SyntaxNode;
  readonly key?: string;
  readonly outer?: Context;
};

const isNode = (value: unknown): value is SyntaxNode =>
  typeof value === "object" && value !== null && "type" in value &&
  typeof value.type === "string";

const nodeField = (node: SyntaxNode, key: string): SyntaxNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

const nodeList = (node: SyntaxNode, key: string): SyntaxNode[] => {
  const value = node[key];
  if (!Array.isArray(value)) return [];
  const items: readonly unknown[] = value;
  return items.filter(isNode);
};

const lineOf = (node: SyntaxNode): number => {
  const loc = node.loc;
  if (typeof loc !== "object" || loc === null || !("start" in loc)) return 0;
  const start = loc.start;
  return typeof start === "object" && start !== null && "line" in start &&
      typeof start.line === "number"
    ? start.line
    : 0;
};

const nameOf = (node: SyntaxNode): string | undefined =>
  node.type === "Identifier" && typeof node.name === "string"
    ? node.name
    : undefined;

// Cooked value of a string or a template without substitutions.
const staticString = (node: SyntaxNode | undefined): string | undefined => {
  if (node === undefined) return undefined;
  if (node.type === "StringLiteral") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  if (node.type === "TSLiteralType") {
    return staticString(nodeField(node, "literal"));
  }
  if (node.type !== "TemplateLiteral") return undefined;
  const quasis = nodeList(node, "quasis");
  if (nodeList(node, "expressions").length > 0 || quasis.length !== 1) {
    return undefined;
  }
  const value = quasis[0].value;
  return typeof value === "object" && value !== null && "cooked" in value &&
      typeof value.cooked === "string"
    ? value.cooked
    : undefined;
};

const isMember = (node: SyntaxNode): boolean =>
  node.type === "MemberExpression" || node.type === "OptionalMemberExpression";

// Static name of a member access; null when the key is computed at runtime.
const memberName = (member: SyntaxNode): string | null => {
  const property = nodeField(member, "property");
  if (property === undefined) return null;
  if (member.computed === true) return staticString(property) ?? null;
  return nameOf(property) ?? null;
};

const WRAPPERS = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

const unwrap = (node: SyntaxNode): SyntaxNode => {
  const inner = WRAPPERS.has(node.type)
    ? nodeField(node, "expression")
    : undefined;
  return inner === undefined ? node : unwrap(inner);
};

const GLOBAL_OBJECTS = new Set(["globalThis", "self", "window"]);

// `name`, `globalThis.name` or `globalThis["name"]` as an expression.
const isGlobalReference = (expression: SyntaxNode, name: string): boolean => {
  const node = unwrap(expression);
  if (node.type === "Identifier") return nameOf(node) === name;
  if (!isMember(node) || memberName(node) !== name) return false;
  const object = nodeField(node, "object");
  const objectName = object === undefined ? undefined : nameOf(unwrap(object));
  return objectName !== undefined && GLOBAL_OBJECTS.has(objectName);
};

// Identifiers in these slots name a property, label or declaration; they do
// not read the global of the same name.
const isNamePosition = (context: Context): boolean => {
  const { parent, key } = context;
  if (parent === undefined || key === undefined) return false;
  if (key === "property") {
    return parent.type === "MetaProperty" ||
      (isMember(parent) && parent.computed !== true);
  }
  if (key === "key") return parent.computed !== true;
  if (key === "right") return parent.type === "TSQualifiedName";
  return ["exported", "id", "imported", "label", "meta"].includes(key);
};

// Skips wrapper expressions so `(Deno as X).env` is judged by its real use.
const usageContext = (context: Context): Context =>
  context.parent !== undefined && WRAPPERS.has(context.parent.type) &&
    context.key === "expression" && context.outer !== undefined
    ? usageContext(context.outer)
    : context;

const isTypeOnlyUse = (context: Context): boolean => {
  const { parent, key } = context;
  if (parent === undefined) return false;
  return parent.type === "TSTypeQuery" ||
    (parent.type === "TSQualifiedName" && key === "left") ||
    (parent.type === "UnaryExpression" && parent.operator === "typeof");
};

const destructuredPattern = (context: Context): SyntaxNode | undefined => {
  const { parent, key } = context;
  if (parent === undefined) return undefined;
  const target = parent.type === "VariableDeclarator" && key === "init"
    ? nodeField(parent, "id")
    : parent.type === "AssignmentExpression" && key === "right"
    ? nodeField(parent, "left")
    : undefined;
  return target?.type === "ObjectPattern" ? target : undefined;
};

const patternMayTake = (pattern: SyntaxNode, name: string): boolean =>
  nodeList(pattern, "properties").some((property) => {
    if (property.type !== "ObjectProperty") return true; // rest element
    const key = nodeField(property, "key");
    if (key === undefined) return true;
    if (property.computed === true) {
      const computedKey = staticString(key);
      return computedKey === undefined || computedKey === name;
    }
    return (nameOf(key) ?? staticString(key)) === name;
  });

// `Deno` used as a value (aliased, passed, destructured) can reach `env`
// without a visible `Deno.env`; only member access and type use are proven.
const denoValueUse = (context: Context): string | undefined => {
  const usage = usageContext(context);
  const { parent, key } = usage;
  if (parent === undefined) return "Deno used as a value";
  if (isMember(parent) && key === "object") return undefined;
  if (isTypeOnlyUse(usage)) return undefined;
  const pattern = destructuredPattern(usage);
  if (pattern !== undefined) {
    return patternMayTake(pattern, "env")
      ? "env destructured from Deno"
      : undefined;
  }
  return "Deno used as a value";
};

const isGlobalNameNode = (
  node: SyntaxNode,
  context: Context,
  name: string,
): boolean =>
  node.type === "Identifier"
    ? nameOf(node) === name && !isNamePosition(context)
    : isMember(node) && isGlobalReference(node, name);

const DIRECTIVES = [
  /^\/\s*<reference\s+(?:types|path)\s*=\s*(["'])(.+?)\1/,
  /@(?:deno|ts)-types\s*=\s*(["'])(.+?)\1/,
];

const SKIPPED_KEYS = new Set([
  "comments",
  "end",
  "errors",
  "extra",
  "innerComments",
  "leadingComments",
  "loc",
  "range",
  "start",
  "tokens",
  "trailingComments",
]);

const parserPlugins = (path: string): ("typescript" | "jsx")[] => {
  const typescript = /\.[cm]?tsx?$/.test(path);
  const jsx = /x$/.test(path);
  return [
    ...(typescript ? ["typescript" as const] : []),
    ...(jsx ? ["jsx" as const] : []),
  ];
};

const parseFile = (path: string, source: string) => {
  try {
    return babelParse(source, {
      sourceType: "module",
      plugins: parserPlugins(path),
      createImportExpressions: true,
      errorRecovery: false,
    });
  } catch (error) {
    // A file the scanner cannot parse is never reported as clean.
    throw new Error(`${path}: cannot be parsed for architecture rules`, {
      cause: error,
    });
  }
};

export const scanSource = (path: string, source: string): SourceFacts => {
  const file = parseFile(path, source);

  const moduleReferences: ModuleReference[] = [];
  const envAccess: Finding[] = [];
  const consoleUse: Finding[] = [];
  const createClientUse: Finding[] = [];

  // One finding per line and detail: Babel may hold a name twice (`{ console }`
  // keeps a key and a value node), and rules report lines, not nodes.
  const record = (findings: Finding[], line: number, detail: string): void => {
    if (!findings.some((f) => f.line === line && f.detail === detail)) {
      findings.push({ line, detail });
    }
  };

  const addReference = (node: SyntaxNode | undefined): void => {
    if (node === undefined) return;
    moduleReferences.push({
      line: lineOf(node),
      specifier: staticString(node) ?? null,
    });
  };

  for (const comment of file.comments ?? []) {
    for (const directive of DIRECTIVES) {
      const match = directive.exec(comment.value);
      if (match !== null) {
        moduleReferences.push({
          line: comment.loc?.start.line ?? 0,
          specifier: match[2],
        });
      }
    }
  }

  const visit = (node: SyntaxNode, context: Context): void => {
    switch (node.type) {
      case "ImportDeclaration":
      case "ExportNamedDeclaration":
      case "ExportAllDeclaration":
      case "ImportExpression":
        addReference(nodeField(node, "source"));
        break;
      case "CallExpression":
        if (nodeField(node, "callee")?.type === "Import") {
          addReference(nodeList(node, "arguments")[0]);
        }
        break;
      case "TSImportType":
        addReference(nodeField(node, "argument"));
        break;
      case "TSExternalModuleReference":
        addReference(nodeField(node, "expression"));
        break;
    }

    if (isMember(node)) {
      const object = nodeField(node, "object");
      if (object !== undefined && isGlobalReference(object, "Deno")) {
        const name = memberName(node);
        if (name === "env" || name === null) {
          record(
            envAccess,
            lineOf(node),
            name === null ? "computed member of Deno" : "Deno.env",
          );
        }
      }
    }
    if (isGlobalNameNode(node, context, "Deno")) {
      const detail = denoValueUse(context);
      if (detail !== undefined) record(envAccess, lineOf(node), detail);
    }
    if (
      isGlobalNameNode(node, context, "console") &&
      !isTypeOnlyUse(usageContext(context))
    ) {
      record(consoleUse, lineOf(node), "console");
    }

    const isCreateClientKey = (context.key === "property" ||
      context.key === "key") && staticString(node) === "createClient";
    if (nameOf(node) === "createClient" || isCreateClientKey) {
      record(createClientUse, lineOf(node), "createClient");
    }

    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) continue;
      const children: readonly unknown[] = Array.isArray(value)
        ? value
        : [value];
      for (const child of children) {
        if (isNode(child)) visit(child, { parent: node, key, outer: context });
      }
    }
  };

  const root: unknown = file.program;
  if (!isNode(root)) throw new Error(`${path}: parser returned no program`);
  visit(root, {});

  return { moduleReferences, envAccess, consoleUse, createClientUse };
};

export type SpecifierKind = "relative" | "builtin" | "third-party";

// Anything that is neither relative nor a `node:` built-in resolves to code
// outside this repository: `npm:`, `jsr:`, URLs, and bare names that an import
// map could point anywhere.
export const classifySpecifier = (specifier: string): SpecifierKind =>
  specifier.startsWith("./") || specifier.startsWith("../")
    ? "relative"
    : specifier.startsWith("node:")
    ? "builtin"
    : "third-party";

// `npm:` or `jsr:`, a package name, an exact semver (pre-release and build
// metadata allowed), and an optional subpath. Ranges, tags, partial versions
// and URLs fail.
const EXACT_VERSION =
  /^(?:npm|jsr):\/?(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?(?:\/\S*)?$/;

export const isExactVersionSpecifier = (specifier: string): boolean =>
  EXACT_VERSION.test(specifier);

export const isSupabaseClientSpecifier = (specifier: string): boolean =>
  /(?:^|[:/])@supabase\/supabase-js(?:$|[@/])/.test(specifier);

// True when a relative specifier from `importer` resolves inside `directory`
// (both relative to `supabase/functions/`, `directory` ending in `/`).
export const resolvesInside = (
  importer: string,
  specifier: string,
  directory: string,
): boolean => {
  if (classifySpecifier(specifier) !== "relative") return false;
  const segments = importer.split("/").slice(0, -1);
  for (const segment of specifier.split(/[?#]/)[0].split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      segments.push(segment);
    } else if (segments.pop() === undefined) {
      return false;
    }
  }
  return segments.join("/").startsWith(directory);
};
