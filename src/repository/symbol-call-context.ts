import ts from "typescript";

export interface RepositorySymbolCallContext {
  symbolName: string;
  filePath: string;
  line: number;
}

export function findSymbolCallContexts(
  sourceCode: string,
  filePath: string,
  symbolName: string,
): RepositorySymbolCallContext[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  const contexts: RepositorySymbolCallContext[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === symbolName
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.expression.getStart(sourceFile),
      );

      contexts.push({
        symbolName,
        filePath,
        line: line + 1,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return contexts;
}
