import { parseToml, parseYaml } from "../dev_deps.ts";

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const recordAt = (value: unknown, key: string): RecordValue | null => {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
};

const ROOT = new URL("../../../../", import.meta.url);
const FUNCTIONS_ROOT = new URL("../../", import.meta.url);
const WORKFLOW_PATH = ".github/workflows/deploy-supabase-functions.yml";

// Function directories the workflow must not deploy yet, each with its
// reason. Empty while every function is deployed.
const NOT_DEPLOYED: readonly string[] = [];

const readFunctionDirectories = async (): Promise<Set<string>> => {
  const directories = new Set<string>();
  for await (const entry of Deno.readDir(FUNCTIONS_ROOT)) {
    if (
      entry.isDirectory && entry.name !== "_shared" && entry.name !== "tests"
    ) {
      directories.add(entry.name);
    }
  }
  return directories;
};

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (isRecord(value)) return Object.values(value).flatMap(collectStrings);
  return [];
};

const readWorkflowDeployments = (workflow: unknown): string[] => {
  const jobs = recordAt(workflow, "jobs");
  if (jobs === null) throw new Error(`${WORKFLOW_PATH}: missing jobs mapping`);

  const lists = Object.values(jobs).flatMap((job) => {
    const environment = recordAt(job, "env");
    return typeof environment?.FUNCTIONS === "string"
      ? [environment.FUNCTIONS]
      : [];
  });
  const strings = collectStrings(workflow);
  const deployCommands = strings.filter((value) =>
    /\bsupabase\s+functions\s+deploy\b/.test(value)
  );

  if (lists.length > 0) {
    if (lists.length !== 1) {
      throw new Error(`${WORKFLOW_PATH}: expected one explicit FUNCTIONS list`);
    }
    if (
      deployCommands.length !== 1 ||
      !deployCommands[0].includes("while IFS= read -r function") ||
      !deployCommands[0].includes('supabase functions deploy "$function"')
    ) {
      throw new Error(
        `${WORKFLOW_PATH}: FUNCTIONS must drive exactly one deployment loop`,
      );
    }
    return lists[0]
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  const deployNamePattern =
    /\bsupabase\s+functions\s+deploy\s+["']?([a-z0-9-]+)/g;
  const names = deployCommands.flatMap((command) =>
    [...command.matchAll(deployNamePattern)].map((match) => match[1])
  );
  if (names.length !== deployCommands.length) {
    throw new Error(
      `${WORKFLOW_PATH}: could not identify every deployed function`,
    );
  }
  return names;
};

const functionDirectories = await readFunctionDirectories();
const workflow = parseYaml(
  await Deno.readTextFile(new URL(WORKFLOW_PATH, ROOT)),
);
const deployedFunctions = readWorkflowDeployments(workflow);
const config = parseToml(
  await Deno.readTextFile(new URL("supabase/config.toml", ROOT)),
);

const assertNoFunctionViolations = (
  testName: string,
  violations: readonly string[],
): void => {
  if (violations.length > 0) {
    throw new Error(`${testName}: ${violations.join("; ")}`);
  }
};

Deno.test("every Edge Function is deployed or explicitly excluded", () => {
  const deployed = new Set(deployedFunctions);
  const excluded = new Set<string>(NOT_DEPLOYED);
  const violations = [
    ...[...functionDirectories].filter((name) =>
      !deployed.has(name) && !excluded.has(name)
    )
      .map((name) => `${name} is neither deployed nor listed in NOT_DEPLOYED`),
    ...NOT_DEPLOYED.filter((name) =>
      deployed.has(name) || !functionDirectories.has(name)
    ).map((name) => `${name} is a stale or deployed NOT_DEPLOYED entry`),
    ...deployedFunctions.filter((name, index) =>
      deployedFunctions.indexOf(name) !== index
    )
      .map((name) => `${name} is deployed more than once`),
  ];
  assertNoFunctionViolations("Edge Function deployment coverage", violations);
});

Deno.test("workflow does not deploy functions without a directory", () => {
  const violations = [...new Set(deployedFunctions)]
    .filter((name) => !functionDirectories.has(name))
    .map((name) => `${name} has no directory under supabase/functions/`);
  assertNoFunctionViolations(
    "Edge Function deployment directories",
    violations,
  );
});

Deno.test("every deployed function has explicit verify_jwt configuration", () => {
  const functions = recordAt(config, "functions");
  const violations = [...new Set(deployedFunctions)].flatMap((name) => {
    if (functions === null || !Object.hasOwn(functions, name)) {
      return [
        `${name} has no [functions.${name}] section in supabase/config.toml`,
      ];
    }
    const section = functions[name];
    if (!isRecord(section) || section.verify_jwt !== false) {
      return [
        `${name} must explicitly set verify_jwt = false in supabase/config.toml`,
      ];
    }
    return [];
  });
  assertNoFunctionViolations("Edge Function JWT configuration", violations);
});
