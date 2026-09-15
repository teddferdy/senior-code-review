import ts from "typescript";

export interface ResolvedSymbolReference {
  symbolName: string;
  filePath: string;
  line: number;
}

export function resolveSymbolReferences(
  sourceCode: string,
  filePath: string,
  symbolName: string,
): ResolvedSymbolReference[] {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.CommonJS,
    strict: true,
  };

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
  );

  const host = ts.createCompilerHost(compilerOptions);

  const originalGetSourceFile = host.getSourceFile;

  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    if (requestedFileName === filePath) {
      return sourceFile;
    }

    return originalGetSourceFile.call(
      host,
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  host.fileExists = (requestedFileName) =>
    requestedFileName === filePath || ts.sys.fileExists(requestedFileName);

  host.readFile = (requestedFileName) =>
    requestedFileName === filePath
      ? sourceCode
      : ts.sys.readFile(requestedFileName);

  const program = ts.createProgram([filePath], compilerOptions, host);

  const checker = program.getTypeChecker();

  let targetSymbol: ts.Symbol | undefined;
  let declaration: ts.Declaration | undefined;

  function findDeclaration(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
      declaration = node;
      targetSymbol = checker.getSymbolAtLocation(node.name);
      return;
    }

    ts.forEachChild(node, findDeclaration);
  }

  findDeclaration(sourceFile);

  if (!targetSymbol) return [];

  const references: ResolvedSymbolReference[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === symbolName) {
      const symbol = checker.getSymbolAtLocation(node);

      if (symbol === targetSymbol) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );

        if (node.parent !== declaration) {
          references.push({
            symbolName,
            filePath,
            line: line + 1,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return references;
}
