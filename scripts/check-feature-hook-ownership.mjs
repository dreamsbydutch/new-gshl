import path from "node:path";
import ts from "typescript";

/** Enforce transport ownership without treating type imports as runtime access. */
export function checkFeatureHookOwnership(file, source) {
  file = file.replaceAll("\\", "/");
  if (!file.startsWith("src/hooks/features/")) return [];
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const failures = [];
  function inspect(node, specifier) {
    const resolved = specifier.startsWith(".")
      ? path.posix.normalize(
          path.posix.join(path.posix.dirname(file), specifier),
        )
      : specifier.replace(/^@gshl-convex\//, "convex/");
    if (!/^(?:convex|@convex-dev)(?:\/|$)/.test(resolved)) return;
    const { line, character } = parsed.getLineAndCharacterOfPosition(
      node.getStart(parsed),
    );
    failures.push(
      `${file}:${line + 1}:${character + 1}: Feature hook has forbidden runtime dependency "${specifier}"; use a domain main hook for Convex access.`,
    );
  }
  function visit(node) {
    if (ts.isTypeNode(node)) return;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const bindings = clause?.namedBindings;
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        !clause.name &&
        bindings.elements.length &&
        bindings.elements.every((item) => item.isTypeOnly)
      )
        return;
      inspect(node, node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (node.isTypeOnly) return;
      const clause = node.exportClause;
      if (
        clause &&
        ts.isNamedExports(clause) &&
        clause.elements.length &&
        clause.elements.every((item) => item.isTypeOnly)
      )
        return;
      inspect(node, node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      inspect(node, node.moduleReference.expression.text);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument))
        inspect(node, argument.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return failures;
}
