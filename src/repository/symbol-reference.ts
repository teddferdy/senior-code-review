import ts from "typescript";

export interface RepositorySymbolReference {
  symbolName: string;
  filePath: string;
  line: number;
}

export function findSymbolReferences(
  sourceCode: string,
  filePath: string,
  symbolName: string,
): RepositorySymbolReference[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  const references: RepositorySymbolReference[] = [];

  function isDeclarationName(node: ts.Identifier): boolean {
    const parent = node.parent;

    if (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)) {
      return parent.name === node;
    }

    if (ts.isVariableDeclaration(parent)) {
      return parent.name === node;
    }

    return false;
  }

  function visit(node: ts.Node): void {
    if (
      ts.isIdentifier(node) &&
      node.text === symbolName &&
      !isDeclarationName(node)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );

      references.push({
        symbolName,
        filePath,
        line: line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return references;
}
