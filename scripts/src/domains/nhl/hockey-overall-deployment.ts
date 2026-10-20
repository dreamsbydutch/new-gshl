import { createHash } from "node:crypto";
import { posix } from "node:path";
import { builtinModules } from "node:module";
import ts from "typescript";

export type DeploymentModule = {
  path: string;
  source: string;
  sourceMap?: string;
  environment: "isolate" | "node";
};
export type DeploymentModuleHash = {
  path: string;
  hash: string;
  environment: "isolate" | "node";
};
export const deploymentRoots = [
  "nhlSeasonValues.js",
  "lib/nhlSeasonValueFields.js",
] as const;
export type DeploymentSchemaScope =
  | "hockey-overall"
  | "dual-ratings"
  | "season-stat-cleanup"
  | "nightly-stats"
  | "gshl-impact-ratings";
export function deploymentRootsForScope(
  scope: DeploymentSchemaScope = "hockey-overall",
  includeRatingFacades = false,
): readonly string[] {
  if (includeRatingFacades && scope !== "gshl-impact-ratings")
    throw Error("Rating facades require explicit GSHL impact scope");
  if (scope === "nightly-stats")
    return ["nightlyNhlStats.js", "lib/nightlyNhlStatFields.js"];
  return scope === "gshl-impact-ratings"
    ? [
        "gshlImpactRatings.js",
        ...(includeRatingFacades
          ? [
              "frontend.js",
              "weeklyEditions.js",
              "performances.js",
              "matchup.js",
            ]
          : []),
      ]
    : deploymentRoots;
}
export const esbuildRequireShim = `var __require = ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, { get: (a, b) => (typeof require !== "undefined" ? require : a)[b] }) : x)(function(x) { if (typeof require !== "undefined") return require.apply(this, arguments); throw Error('Dynamic require of "' + x + '" is not supported'); });`;
function tokens(source: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    source,
  );
  const result: unknown[] = [];
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  )
    result.push([token, scanner.getTokenValue() || scanner.getTokenText()]);
  return JSON.stringify(result);
}
/** Exact compiler AST; only bound formal-parameter names may differ. */
function initializerShape(root: ts.Node): string {
  const shape = (node: ts.Node, scopes: Map<string, string>[]): unknown => {
    if (ts.isParenthesizedExpression(node))
      return shape(node.expression, scopes);
    let nested = scopes;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const bindings = new Map<string, string>();
      node.parameters.forEach((parameter, index) => {
        if (!ts.isIdentifier(parameter.name)) return;
        bindings.set(parameter.name.text, `bound:${scopes.length}:${index}`);
      });
      nested = [...scopes, bindings];
    }
    let text: string | undefined;
    if (ts.isIdentifier(node)) {
      const propertyName =
        (ts.isPropertyAccessExpression(node.parent) &&
          node.parent.name === node) ||
        ((ts.isPropertyAssignment(node.parent) ||
          ts.isMethodDeclaration(node.parent)) &&
          node.parent.name === node);
      text = node.text;
      if (!propertyName)
        for (let index = nested.length - 1; index >= 0; index--) {
          const binding = nested[index]!.get(node.text);
          if (binding) {
            text = binding;
            break;
          }
        }
    } else if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
      text = node.text;
    const children: unknown[] = [];
    ts.forEachChild(node, (child) => {
      children.push(shape(child, nested));
    });
    return {
      kind: node.kind,
      ...(text === undefined ? {} : { text }),
      children,
    };
  };
  return JSON.stringify(shape(root, []));
}
export class NodeDependencyProofError extends Error {
  constructor(
    readonly evidence: {
      modulePath: string;
      construct: string;
      knownShimCount: number;
      enclosingDeclaration?: string;
      initializerKind?: string;
      initializerTokenSha256?: string;
    },
  ) {
    super("Unresolved require alias prevents preservation proof");
  }
}
/** Conservative dependency proof for unchanged Node modules, never an arbitrary JS sandbox. */
export function auditBuiltinOnlyNodeModules(
  modules: DeploymentModule[],
  compilerFixture: string | string[] = esbuildRequireShim,
) {
  const modulesByPath = uniqueModules(modules);
  const builtin = new Set(
    builtinModules.flatMap((name) => [name, `node:${name}`]),
  );
  const imports = new Set<string>();
  let literalLoads = 0;
  const nodeModules = modules.filter((module) => module.environment === "node");
  const parsed = new Map(
    nodeModules.map((module) => [
      module.path,
      ts.createSourceFile(
        module.path,
        module.source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      ),
    ]),
  );
  const fixtureShapes = (
    Array.isArray(compilerFixture) ? compilerFixture : [compilerFixture]
  ).map((fixture) => {
    const shimAst = ts.createSourceFile(
      "reference.js",
      fixture,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const reference = (shimAst.statements[0] as ts.VariableStatement)
      .declarationList.declarations[0]!.initializer!;
    return initializerShape(reference);
  });
  const knownDeclarations = new Set<ts.Node>();
  const bindings = new Map<string, Set<string>>();
  for (const [path, source] of parsed) {
    const known = new Set<string>();
    const reserved = new Set(["require", "Proxy", "Error", "arguments"]);
    const boundNames = (name: ts.BindingName): string[] =>
      ts.isIdentifier(name)
        ? [name.text]
        : name.elements.flatMap((element) =>
            ts.isOmittedExpression(element) ? [] : boundNames(element.name),
          );
    const shadowedGlobals = source.statements.some((statement) => {
      if (ts.isVariableStatement(statement))
        return statement.declarationList.declarations.some((declaration) =>
          boundNames(declaration.name).some((name) => reserved.has(name)),
        );
      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name
      )
        return reserved.has(statement.name.text);
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const clause = statement.importClause;
        if (clause.name && reserved.has(clause.name.text)) return true;
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
          return reserved.has(clause.namedBindings.name.text);
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
          return clause.namedBindings.elements.some((item) =>
            reserved.has(item.name.text),
          );
      }
      return false;
    });
    const find = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isVariableDeclarationList(node.parent) &&
        ts.isVariableStatement(node.parent.parent) &&
        ts.isSourceFile(node.parent.parent.parent) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        fixtureShapes.includes(initializerShape(node.initializer))
      ) {
        if (shadowedGlobals) throw Error("Compiler shim globals are shadowed");
        knownDeclarations.add(node);
        known.add(node.name.text);
      }
      ts.forEachChild(node, find);
    };
    find(source);
    bindings.set(path, known);
  }
  const relative = (path: string, specifier: string) =>
    posix.normalize(posix.join(posix.dirname(path), specifier));
  const exported = (path: string, name: string): boolean => {
    const source = parsed.get(path);
    return !!source?.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        !statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some(
          (item) =>
            item.name.text === name &&
            bindings.get(path)?.has((item.propertyName ?? item.name).text),
        ),
    );
  };
  for (let pass = 0; pass < parsed.size; pass++) {
    let changed = false;
    for (const [path, source] of parsed)
      for (const statement of source.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          !statement.moduleSpecifier.text.startsWith(".") ||
          !statement.importClause?.namedBindings ||
          !ts.isNamedImports(statement.importClause.namedBindings)
        )
          continue;
        for (const item of statement.importClause.namedBindings.elements) {
          if (
            exported(
              relative(path, statement.moduleSpecifier.text),
              (item.propertyName ?? item.name).text,
            ) &&
            !bindings.get(path)!.has(item.name.text)
          ) {
            bindings.get(path)!.add(item.name.text);
            changed = true;
          }
        }
      }
    if (!changed) break;
  }
  for (const module of nodeModules) {
    const source = parsed.get(module.path)!;
    const checkSpecifier = (specifier: string) => {
      literalLoads++;
      if (specifier.startsWith(".")) {
        const resolved = posix.normalize(
          posix.join(posix.dirname(module.path), specifier),
        );
        if (!modulesByPath.has(resolved))
          throw Error("Unresolved Node dependency");
      } else if (builtin.has(specifier)) imports.add(specifier);
      else throw Error("External Node dependency prevents preservation proof");
    };
    const walk = (node: ts.Node): void => {
      if (knownDeclarations.has(node)) return;
      if (
        ts.isImportSpecifier(node) &&
        bindings.get(module.path)!.has(node.name.text)
      )
        return;
      if (
        ts.isExportSpecifier(node) &&
        bindings.get(module.path)!.has((node.propertyName ?? node.name).text)
      )
        return;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        if (!ts.isStringLiteral(node.moduleSpecifier))
          throw Error("Nonliteral Node dependency");
        checkSpecifier(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        if (
          node.arguments.length !== 1 ||
          !ts.isStringLiteral(node.arguments[0]!)
        )
          throw Error("Dynamic Node dependency prevents preservation proof");
        checkSpecifier((node.arguments[0]! as ts.StringLiteral).text);
      }
      if (ts.isIdentifier(node) && node.text === "createRequire")
        throw Error("createRequire prevents preservation proof");
      if (
        ts.isIdentifier(node) &&
        node.text === "require" &&
        ts.isTypeOfExpression(node.parent) &&
        node.parent.expression === node
      )
        return;
      if (
        ts.isIdentifier(node) &&
        (/^(?:__)?require\d*$/.test(node.text) ||
          bindings.get(module.path)!.has(node.text))
      ) {
        if (
          (node.text !== "require" &&
            !bindings.get(module.path)!.has(node.text)) ||
          !ts.isCallExpression(node.parent) ||
          node.parent.expression !== node ||
          node.parent.arguments.length !== 1 ||
          !ts.isStringLiteral(node.parent.arguments[0]!)
        ) {
          let enclosing: ts.Node | undefined = node.parent;
          while (enclosing && !ts.isVariableDeclaration(enclosing))
            enclosing = enclosing.parent;
          const declaration =
            enclosing && ts.isVariableDeclaration(enclosing)
              ? enclosing
              : undefined;
          throw new NodeDependencyProofError({
            modulePath: module.path,
            construct: ts.SyntaxKind[node.parent.kind],
            knownShimCount: knownDeclarations.size,
            enclosingDeclaration:
              declaration && ts.isIdentifier(declaration.name)
                ? declaration.name.text
                : undefined,
            initializerKind: declaration?.initializer
              ? ts.SyntaxKind[declaration.initializer.kind]
              : undefined,
            initializerTokenSha256: declaration?.initializer
              ? createHash("sha256")
                  .update(tokens(declaration.initializer.getText(source)))
                  .digest("hex")
              : undefined,
          });
        }
        checkSpecifier((node.parent.arguments[0]! as ts.StringLiteral).text);
      }
      if (ts.isIdentifier(node) && ["eval", "Function"].includes(node.text))
        throw Error("Dynamic code prevents Node dependency preservation proof");
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  return {
    modulePaths: nodeModules.map((module) => module.path).sort(),
    builtinImports: [...imports].sort(),
    literalLoads,
    exactEsbuildRequireShims: knownDeclarations.size,
  };
}
export function moduleDigest(module: DeploymentModule) {
  return createHash("sha256")
    .update(module.source)
    .update(module.sourceMap ?? "")
    .digest("hex");
}
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function uniqueModules(modules: DeploymentModule[]) {
  const map = new Map<string, DeploymentModule>();
  for (const module of modules) {
    if (
      map.has(module.path) ||
      !/^[A-Za-z0-9_./-]+\.js$/.test(module.path) ||
      posix.normalize(module.path) !== module.path ||
      module.path.startsWith("../") ||
      module.path.startsWith("/")
    )
      throw Error("Invalid or duplicate deployment module path");
    map.set(module.path, module);
  }
  return map;
}
/** Retain live code byte-for-byte; only the reviewed entrypoints and new chunks change. */
export function composeDeploymentOverlay(input: {
  remote: DeploymentModule[];
  remoteHashes: DeploymentModuleHash[];
  localChanged: DeploymentModule[];
  schema: DeploymentModule;
  schemaScope?: DeploymentSchemaScope;
  includeRatingFacades?: boolean;
}) {
  const roots = deploymentRootsForScope(
    input.schemaScope,
    input.includeRatingFacades,
  );
  const remote = uniqueModules(input.remote);
  const local = uniqueModules(input.localChanged);
  if (
    input.schema.path !== "schema.js" ||
    input.schema.environment !== "isolate"
  )
    throw Error("Deployment schema must be schema.js in isolate environment");
  for (const path of roots)
    if (!local.has(path))
      throw Error("Missing explicit reviewed deployment entrypoint");
  const hashes = new Map(input.remoteHashes.map((item) => [item.path, item]));
  if (hashes.size !== input.remoteHashes.length || hashes.size !== remote.size)
    throw Error("Production source and hash inventories differ");
  for (const module of remote.values()) {
    const hash = hashes.get(module.path);
    if (
      !hash ||
      moduleDigest(module) !== hash.hash ||
      module.environment !== hash.environment
    )
      throw Error("Production source/hash baseline changed during read");
  }
  if (!remote.has("convex.config.js") || !remote.has("schema.js"))
    throw Error("Missing production definition or schema");
  const selected = new Map<string, DeploymentModule>();
  const visited = new Set<string>();
  const visit = (module: DeploymentModule, schema = false) => {
    if (visited.has(module.path)) return;
    visited.add(module.path);
    if (!schema) {
      const existing = remote.get(module.path);
      const root = roots.some((path) => path === module.path);
      if (existing && moduleDigest(existing) !== moduleDigest(module) && !root)
        throw Error("Dependency path collides with preserved production code");
      if (!existing && !module.path.startsWith("_deps/") && !root)
        throw Error("Unexpected entrypoint outside deployment allowlist");
      if (!existing || moduleDigest(existing) !== moduleDigest(module))
        selected.set(module.path, module);
    }
    for (const imported of ts.preProcessFile(module.source, true, true)
      .importedFiles) {
      if (!imported.fileName.startsWith(".")) continue;
      const path = posix.normalize(
        posix.join(posix.dirname(module.path), imported.fileName),
      );
      const dependency = local.get(path) ?? remote.get(path);
      if (!dependency) throw Error("Missing deployment dependency");
      visit(dependency);
    }
  };
  for (const path of roots) {
    const module = local.get(path) ?? remote.get(path);
    if (!module) throw Error("Missing reviewed deployment entrypoint");
    visit(module);
  }
  visit(input.schema, true);
  const changedModules = [...selected.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const unchangedModuleHashes = [...hashes.values()]
    .filter(
      (item) =>
        !selected.has(item.path) &&
        item.path !== "schema.js" &&
        item.path !== "convex.config.js",
    )
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => ({
      path: item.path,
      environment: item.environment,
      sha256: item.hash,
    }));
  return {
    changedModules,
    unchangedModuleHashes,
    definition: remote.get("convex.config.js")!,
    schema: input.schema,
  };
}

/** Only nhlSeasonValues.hockeyOverall may be added, as an optional field. */
export function assertOnlyHockeyOverallSchemaChange(
  previous: unknown,
  next: unknown,
) {
  const before = structuredClone(previous) as {
    tables: {
      tableName: string;
      documentType: { value: Record<string, { optional: boolean }> };
    }[];
  };
  const after = structuredClone(next) as typeof before;
  const oldTable = before.tables.find(
    (item) => item.tableName === "nhlSeasonValues",
  );
  const newTable = after.tables.find(
    (item) => item.tableName === "nhlSeasonValues",
  );
  if (
    !oldTable ||
    !newTable ||
    !newTable.documentType.value.hockeyOverall?.optional
  )
    throw Error("Reviewed schema requires optional hockeyOverall field");
  if (oldTable.documentType.value.hockeyOverall) {
    if (stableJson(before) !== stableJson(after))
      throw Error("Existing reviewed schema differs from proposed schema");
    return;
  }
  delete newTable.documentType.value.hockeyOverall;
  if (stableJson(before) !== stableJson(after))
    throw Error("Schema changes outside optional hockeyOverall are forbidden");
}

/** Dual-rating rollout may add only optional per-stat-line hockey details. */
export function assertOnlyDualRatingsSchemaChange(
  previous: unknown,
  next: unknown,
) {
  const before = structuredClone(previous) as {
    tables: {
      tableName: string;
      documentType: { value: Record<string, { optional: boolean }> };
    }[];
  };
  const after = structuredClone(next) as typeof before;
  const table = (schema: typeof before, name: string) => {
    const matches = schema.tables.filter((item) => item.tableName === name);
    if (matches.length !== 1)
      throw Error("Dual ratings require unique existing NHL rating tables");
    return matches[0]!;
  };
  if (
    stableJson(table(before, "nhlSeasonValues")) !==
    stableJson(table(after, "nhlSeasonValues"))
  )
    throw Error(
      "Dual ratings must preserve the nhlSeasonValues schema exactly",
    );
  const oldTable = table(before, "playerNhlStatLines");
  const newTable = table(after, "playerNhlStatLines");
  if (newTable.documentType.value.hockeyRating?.optional !== true)
    throw Error(
      "Dual ratings require optional playerNhlStatLines.hockeyRating",
    );
  if (!oldTable.documentType.value.hockeyRating)
    delete newTable.documentType.value.hockeyRating;
  if (stableJson(before) !== stableJson(after))
    throw Error("Schema changes outside optional hockeyRating are forbidden");
}

export function assertDeploymentSchemaChange(
  previous: unknown,
  next: unknown,
  scope: DeploymentSchemaScope = "hockey-overall",
) {
  if (scope === "hockey-overall")
    return assertOnlyHockeyOverallSchemaChange(previous, next);
  if (scope === "dual-ratings")
    return assertOnlyDualRatingsSchemaChange(previous, next);
  if (scope === "season-stat-cleanup")
    return assertOnlySeasonStatCleanupSchemaChange(previous, next);
  if (scope === "gshl-impact-ratings")
    return assertOnlyGshlImpactSchemaChange(previous, next);
  if (scope === "nightly-stats")
    return assertOnlyNightlyStatsSchemaChange(previous, next);
  throw Error("Unsupported deployment schema scope");
}

/** Nightly NHL maintenance may add only its source provenance and team summary table. */
export function assertOnlyNightlyStatsSchemaChange(
  previous: unknown,
  next: unknown,
) {
  type Schema = {
    tables: {
      tableName: string;
      documentType: { value: Record<string, unknown> };
    }[];
  };
  const before = structuredClone(previous) as Schema,
    after = structuredClone(next) as Schema;
  const get = (schema: Schema, name: string) => {
    const found = schema.tables.filter((t) => t.tableName === name);
    if (found.length !== 1)
      throw Error("Nightly stats require unique canonical tables");
    return found[0]!;
  };
  get(before, "nhlSeasonValues");
  get(after, "nhlSeasonValues");
  get(before, "nhlTeams");
  get(after, "nhlTeams");
  const oldFields = get(before, "playerNhlStatLines").documentType.value;
  const newFields = get(after, "playerNhlStatLines").documentType.value;
  for (const [field, type] of [
    ["nhlStatsSourceFetchedAt", "number"],
    ["nhlStatsSourceSha256", "string"],
  ] as const) {
    const expected = {
      optional: true,
      fieldType: { type: "union", value: [{ type }, { type: "null" }] },
    };
    if (stableJson(newFields[field]) !== stableJson(expected))
      throw Error(
        "Nightly provenance requires exact optional nullable validators",
      );
    if (!Object.hasOwn(oldFields, field)) delete newFields[field];
  }
  const expectedTeam = {
    tableName: "nhlTeamSeasonStatLines",
    indexes: [
      { indexDescriptor: "by_legacyId", fields: ["legacyId"] },
      { indexDescriptor: "by_seasonId", fields: ["seasonId"] },
      {
        indexDescriptor: "by_seasonId_nhlTeamId",
        fields: ["seasonId", "nhlTeamId"],
      },
    ],
    stagedDbIndexes: [],
    searchIndexes: [],
    stagedSearchIndexes: [],
    vectorIndexes: [],
    stagedVectorIndexes: [],
    documentType: {
      type: "object",
      value: {
        legacyId: { fieldType: { type: "string" }, optional: true },
        seasonId: {
          fieldType: { type: "id", tableName: "seasons" },
          optional: false,
        },
        nhlTeamId: {
          fieldType: { type: "id", tableName: "nhlTeams" },
          optional: false,
        },
        ...Object.fromEntries(
          ["GP", "W", "L", "OTL", "P", "GF", "GA", "sourceFetchedAt"].map(
            (k) => [k, { fieldType: { type: "number" }, optional: false }],
          ),
        ),
        sourceSha256: { fieldType: { type: "string" }, optional: false },
      },
    },
  };
  const nextTeam = get(after, "nhlTeamSeasonStatLines");
  // Convex analysis appends the implicit tie-break field and an explicit null
  // staged validator. Normalize only these observed new-table decorations.
  const normalizedTeam = structuredClone(nextTeam) as typeof expectedTeam & {
    stagedDocumentType?: unknown;
  };
  if (normalizedTeam.stagedDocumentType === null)
    delete normalizedTeam.stagedDocumentType;
  for (const index of normalizedTeam.indexes) {
    const expectedIndex = expectedTeam.indexes.find(
      (item) => item.indexDescriptor === index.indexDescriptor,
    );
    if (
      expectedIndex &&
      stableJson(index.fields) ===
        stableJson([...expectedIndex.fields, "_creationTime"])
    )
      index.fields = [...expectedIndex.fields];
  }
  if (stableJson(normalizedTeam) !== stableJson(expectedTeam))
    throw Error(
      "Nightly NHL team table must match the exact reviewed summary schema",
    );
  const oldTeams = before.tables.filter(
    (t) => t.tableName === "nhlTeamSeasonStatLines",
  );
  if (oldTeams.length > 1) throw Error("Duplicate NHL team season table");
  if (!oldTeams.length)
    after.tables = after.tables.filter(
      (t) => t.tableName !== "nhlTeamSeasonStatLines",
    );
  if (stableJson(before) !== stableJson(after))
    throw Error(
      "Schema changes outside nightly NHL provenance and team summary are forbidden",
    );
}

/** Existing indexes stay exact; only a newly introduced team's three indexes may appear. */
export function assertDeploymentIndexChanges(
  previous: unknown,
  next: unknown,
  diffs: unknown,
  scope: DeploymentSchemaScope,
) {
  const fail = () => {
    throw Error("Index changes are outside reviewed deployment scope");
  };
  if (diffs === undefined || diffs === null) return;
  if (typeof diffs !== "object" || Array.isArray(diffs)) return fail();
  const components = diffs as Record<string, unknown>;
  if (Object.keys(components).some((key) => key !== "")) return fail();
  const root = components[""];
  if (root === undefined) return;
  if (!root || typeof root !== "object" || Array.isArray(root)) return fail();
  const index = root as Record<string, unknown>;
  if (
    Object.keys(index).some(
      (key) =>
        ![
          "added_indexes",
          "removed_indexes",
          "enabled_indexes",
          "disabled_indexes",
        ].includes(key),
    )
  )
    return fail();
  for (const [key, values] of Object.entries(index)) {
    if (!Array.isArray(values)) return fail();
    if (key !== "added_indexes" && values.length) return fail();
  }
  const added = index.added_indexes ?? [];
  if (!Array.isArray(added)) return fail();
  if (!added.length) return;
  if (scope !== "nightly-stats") return fail();
  // Reuse the complete schema proof; this permits no index mutation on an old table.
  assertOnlyNightlyStatsSchemaChange(previous, next);
  const oldSchema = previous as { tables: { tableName: string }[] };
  if (
    oldSchema.tables.some(
      (table) => table.tableName === "nhlTeamSeasonStatLines",
    )
  )
    return fail();
  const expected = new Map([
    ["nhlTeamSeasonStatLines.by_legacyId", ["legacyId"]],
    ["nhlTeamSeasonStatLines.by_seasonId", ["seasonId"]],
    ["nhlTeamSeasonStatLines.by_seasonId_nhlTeamId", ["seasonId", "nhlTeamId"]],
  ]);
  if (added.length !== expected.size) return fail();
  const seen = new Set<string>();
  for (const entry of added) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return fail();
    const row = entry as Record<string, unknown>;
    if (
      Object.keys(row).some(
        (key) => !["name", "type", "fields", "staged"].includes(key),
      ) ||
      row.type !== "database" ||
      (row.staged !== undefined && row.staged !== false) ||
      typeof row.name !== "string" ||
      seen.has(row.name)
    )
      return fail();
    const fields = expected.get(row.name);
    if (
      !fields ||
      (stableJson(row.fields) !== stableJson(fields) &&
        stableJson(row.fields) !== stableJson([...fields, "_creationTime"]))
    )
      return fail();
    seen.add(row.name);
  }
}

export const gshlImpactSchemaTables = [
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
  "playerDayHighlights",
] as const;

/** Only versioned contribution metadata may be added; ratings/indexes remain exact. */
export function assertOnlyGshlImpactSchemaChange(
  previous: unknown,
  next: unknown,
) {
  type Schema = {
    tables: {
      tableName: string;
      documentType: { value: Record<string, unknown> };
    }[];
  };
  const before = structuredClone(previous) as Schema,
    after = structuredClone(next) as Schema;
  const validators = {
    averageRating: {
      optional: true,
      fieldType: {
        type: "union",
        value: [{ type: "number" }, { type: "null" }],
      },
    },
    ratingVersion: {
      optional: true,
      fieldType: {
        type: "union",
        value: [{ type: "string" }, { type: "null" }],
      },
    },
    ratingAppearances: {
      optional: true,
      fieldType: {
        type: "union",
        value: [{ type: "number" }, { type: "null" }],
      },
    },
  };
  for (const name of gshlImpactSchemaTables) {
    const oldTables = before.tables.filter((t) => t.tableName === name),
      newTables = after.tables.filter((t) => t.tableName === name);
    if (oldTables.length !== 1 || newTables.length !== 1)
      throw Error("Impact schema requires all ten unique existing tables");
    const oldFields = oldTables[0]!.documentType.value,
      newFields = newTables[0]!.documentType.value;
    for (const [field, validator] of Object.entries(validators)) {
      if (stableJson(newFields[field]) !== stableJson(validator))
        throw Error(
          "Impact metadata requires exact optional nullable validators",
        );
      if (!Object.hasOwn(oldFields, field)) delete newFields[field];
    }
  }
  if (stableJson(before) !== stableJson(after))
    throw Error(
      "Schema changes outside GSHL contribution metadata are forbidden",
    );
}

/** Source cleanup adds only the schema's existing optional stat-value shape for GS. */
export function assertOnlySeasonStatCleanupSchemaChange(
  previous: unknown,
  next: unknown,
) {
  const before = structuredClone(previous) as {
    tables: {
      tableName: string;
      documentType: { value: Record<string, unknown> };
    }[];
  };
  const after = structuredClone(next) as typeof before;
  const get = (schema: typeof before, name: string) => {
    const found = schema.tables.filter((t) => t.tableName === name);
    if (found.length !== 1)
      throw Error("Cleanup requires unique existing NHL rating tables");
    return found[0]!;
  };
  get(before, "nhlSeasonValues");
  get(after, "nhlSeasonValues");
  const oldFields = get(before, "playerNhlStatLines").documentType.value;
  const newFields = get(after, "playerNhlStatLines").documentType.value;
  if (
    !oldFields.hockeyRating ||
    stableJson(oldFields.hockeyRating) !== stableJson(newFields.hockeyRating)
  )
    throw Error("Cleanup must preserve existing hockeyRating exactly");
  // GP is the canonical optional number|string|null stat validator in this table.
  const expected = {
    optional: true,
    fieldType: {
      type: "union",
      value: [{ type: "number" }, { type: "string" }, { type: "null" }],
    },
  };
  if (stableJson(newFields.GS) !== stableJson(expected))
    throw Error("Cleanup requires optional numeric/string/null GS statistic");
  if (!Object.hasOwn(oldFields, "GS")) delete newFields.GS;
  if (stableJson(before) !== stableJson(after))
    throw Error("Schema changes outside optional goalie GS are forbidden");
}
