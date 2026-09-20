import path from "node:path";
import ts from "typescript";

const lifecycleHooks = new Set([
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useSyncExternalStore",
  "useTransition",
  "useOptimistic",
  "useActionState",
  "useRef",
  "useMemo",
  "useCallback",
  "useDeferredValue",
  "useImperativeHandle",
]);

function forbiddenModule(file, specifier) {
  const resolved = specifier.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
    : specifier.replace(/^@gshl-lib\//, "src/lib/");
  return [
    /^@gshl-(?:hooks|cache|server|convex|sheets|yahoo|nhl)(?:\/|$)/,
    /^(?:src\/hooks|src\/server|src\/lib\/(?:cache|data|sheets|yahoo|nhl)|convex)(?:\/|$)/,
    /^(?:convex|@convex-dev)(?:\/|$)/,
    /^next-auth\/react(?:\/|$)/,
    /^@(?:tanstack\/(?:react-query|query-core)|apollo\/client|uploadthing\/react)(?:\/|$)/,
    /^(?:swr|react-query)(?:\/|$)/,
  ].some((pattern) => pattern.test(resolved));
}

/** Targeted route policy, not a general business-logic or transitive dependency analysis. */
export function checkRouteBehavior(file, source) {
  file = file.replaceAll("\\", "/");
  if (!file.startsWith("src/app/") || path.posix.basename(file) === "route.ts")
    return [];
  const errorEntry = /(?:^|\/)(?:global-)?error\.tsx$/.test(file);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  // An in-memory, no-lib program supplies lexical bindings without reading the
  // project or resolving dependencies (notably local parameters named fetch).
  const program = ts.createProgram(
    [file],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (name) => (name === file ? sourceFile : undefined),
      getDefaultLibFileName: () => "",
      writeFile: () => {},
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      fileExists: (name) => name === file,
      readFile: (name) => (name === file ? source : undefined),
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
    },
  );
  const checker = program.getTypeChecker();
  const failures = [];
  const report = (node, message) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    failures.push(`${file}:${line + 1}:${character + 1}: ${message}`);
  };
  const isGlobal = (node, name) =>
    ts.isIdentifier(node) &&
    node.text === name &&
    !checker.getSymbolAtLocation(node)?.declarations?.length;
  const memberForbidden = (module, member) =>
    (module === "react" &&
      lifecycleHooks.has(member) &&
      !(errorEntry && member === "useEffect")) ||
    (module === "next/navigation" && /^use[A-Z]/.test(member));
  const reportMember = (node, module, member) => {
    if (memberForbidden(module, member))
      report(
        node,
        `Route uses ${module} ${member}; move state, effects, or client navigation into a component or hook.`,
      );
  };
  const literalModule = (node) => {
    if (!ts.isCallExpression(node)) return undefined;
    if (
      node.expression.kind !== ts.SyntaxKind.ImportKeyword &&
      !isGlobal(node.expression, "require")
    )
      return undefined;
    const argument = node.arguments[0];
    return argument && ts.isStringLiteralLike(argument)
      ? argument.text
      : undefined;
  };
  // Recognize namespaces and simple literal require/import assignments. Avoid
  // following arbitrary value flow; cycles in local aliases are not traversed.
  const moduleOf = (node, seen = new Set()) => {
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node))
      return moduleOf(node.expression, seen);
    const literal = literalModule(node);
    if (literal) return literal;
    if (!ts.isIdentifier(node)) return undefined;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || seen.has(symbol)) return undefined;
    seen.add(symbol);
    const declaration = symbol.declarations?.[0];
    if (
      declaration &&
      (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration))
    ) {
      const clause = ts.isImportClause(declaration)
        ? declaration
        : declaration.parent;
      if (!clause.isTypeOnly) return clause.parent.moduleSpecifier.text;
    }
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer
    )
      return moduleOf(declaration.initializer, seen);
    return undefined;
  };
  const inspectModule = (node, specifier) => {
    if (forbiddenModule(file, specifier))
      report(
        node,
        `Route has forbidden runtime dependency "${specifier}"; move fetching and integrations into hooks or the owning lib module, and render a component here.`,
      );
  };
  function visit(node) {
    // Type expressions, including import("...") types, carry no behavior.
    if (
      ts.isTypeNode(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node)
    )
      return;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const bindings = clause?.namedBindings;
      const members =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements.filter((item) => !item.isTypeOnly)
          : [];
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        !clause.name &&
        !members.length &&
        bindings.elements.length
      )
        return;
      const specifier = node.moduleSpecifier.text;
      inspectModule(node, specifier);
      for (const member of members)
        reportMember(
          member,
          specifier,
          (member.propertyName ?? member.name).text,
        );
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (node.isTypeOnly) return;
      const members =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.filter((item) => !item.isTypeOnly)
          : undefined;
      if (members?.length === 0 && node.exportClause.elements.length) return;
      const specifier = node.moduleSpecifier.text;
      inspectModule(node, specifier);
      if (members)
        for (const member of members)
          reportMember(
            member,
            specifier,
            (member.propertyName ?? member.name).text,
          );
      else if (specifier === "react" || specifier === "next/navigation")
        report(
          node,
          `Route re-exports the ${specifier} runtime namespace; keep route exports explicit and move hooks into their owning layer.`,
        );
      return;
    }
    const specifier = literalModule(node);
    if (specifier) inspectModule(node, specifier);
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const member = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isStringLiteralLike(node.argumentExpression)
          ? node.argumentExpression.text
          : undefined;
      if (member) reportMember(node, moduleOf(node.expression), member);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const module = moduleOf(node.initializer);
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key))
          reportMember(element, module, key.text);
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const directFetch = isGlobal(callee, "fetch");
      const memberFetch =
        (ts.isPropertyAccessExpression(callee) ||
          ts.isElementAccessExpression(callee)) &&
        (isGlobal(callee.expression, "globalThis") ||
          isGlobal(callee.expression, "window")) &&
        (ts.isPropertyAccessExpression(callee)
          ? callee.name.text === "fetch"
          : ts.isStringLiteralLike(callee.argumentExpression) &&
            callee.argumentExpression.text === "fetch");
      if (directFetch || memberFetch)
        report(
          node,
          "Route performs inline fetch; move fetching into a hook or the owning lib module.",
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return failures;
}
