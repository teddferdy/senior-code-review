import ts from "typescript";

import type { RepositorySymbol } from "./symbols.js";

export function analyzeSymbols(
  sourceCode: string,
  filePath: string,
): RepositorySymbol[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  const symbols: RepositorySymbol[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );

      const exported =
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) ?? false;

      symbols.push({
        name: node.name.text,
        kind: "function",
        filePath,
        line: line + 1,
        exported,
      });
    }

    if (ts.isClassDeclaration(node) && node.name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );

      const exported =
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) ?? false;

      symbols.push({
        name: node.name.text,
        kind: "class",
        filePath,
        line: line + 1,
        exported,
      });
    }

    if (ts.isMethodDeclaration(node) && node.name) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );

      symbols.push({
        name: node.name.getText(sourceFile),
        kind: "method",
        filePath,
        line: line + 1,
        exported: false,
      });
    }

    if (ts.isVariableStatement(node)) {
      const exported =
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) ?? false;

      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const { line } = sourceFile.getLineAndCharacterOfPosition(
          declaration.getStart(sourceFile),
        );

        symbols.push({
          name: declaration.name.text,
          kind: "variable",
          filePath,
          line: line + 1,
          exported,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return symbols;
}
