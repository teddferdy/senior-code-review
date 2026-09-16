import ts from "typescript";

export interface RepositorySymbolCallContext {
  symbolName: string;
  filePath: string;
  line: number;
}

const VIRTUAL_ROOT = "/__senior_code_reviewer__";

function toVirtualPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");

  return `${VIRTUAL_ROOT}/${normalized}`.replace(/\/+/g, "/");
}

function fromVirtualPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith(`${VIRTUAL_ROOT}/`)) {
    return normalized.slice(VIRTUAL_ROOT.length + 1);
  }

  return normalized;
}

export function findSymbolCallContexts(
  sources: Record<string, string>,
  filePath: string,
  symbolName: string,
): RepositorySymbolCallContext[] {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    strict: true,
  };

  const virtualSources = new Map<string, string>();

  for (const [sourcePath, sourceCode] of Object.entries(sources)) {
    virtualSources.set(toVirtualPath(sourcePath), sourceCode);
  }

  const host = ts.createCompilerHost(compilerOptions);

  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const normalizedFileName = requestedFileName.replace(/\\/g, "/");
    const sourceCode = virtualSources.get(normalizedFileName);

    if (sourceCode !== undefined) {
      return ts.createSourceFile(
        requestedFileName,
        sourceCode,
        languageVersion,
        true,
      );
    }

    return ts
      .createCompilerHost(compilerOptions)
      .getSourceFile(
        requestedFileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
  };

  host.fileExists = (requestedFileName) => {
    const normalizedFileName = requestedFileName.replace(/\\/g, "/");

    if (virtualSources.has(normalizedFileName)) {
      return true;
    }

    return ts.sys.fileExists(requestedFileName);
  };

  host.directoryExists = (directoryName) => {
    const normalized =
      directoryName.replace(/\\/g, "/").replace(/\/+$/, "") || "/";

    const prefix = normalized === "/" ? "/" : `${normalized}/`;

    for (const virtualPath of virtualSources.keys()) {
      if (virtualPath === normalized || virtualPath.startsWith(prefix)) {
        return true;
      }
    }

    return ts.sys.directoryExists(directoryName);
  };

  host.readFile = (requestedFileName) => {
    const normalizedFileName = requestedFileName.replace(/\\/g, "/");
    const sourceCode = virtualSources.get(normalizedFileName);

    if (sourceCode !== undefined) {
      return sourceCode;
    }

    return ts.sys.readFile(requestedFileName);
  };

  const program = ts.createProgram(
    [...virtualSources.keys()],
    compilerOptions,
    host,
  );

  const checker = program.getTypeChecker();

  function resolveSymbol(symbol: ts.Symbol): ts.Symbol {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      return checker.getAliasedSymbol(symbol);
    }

    return symbol;
  }

  const targetVirtualPath = toVirtualPath(filePath);
  const targetSourceFile = program.getSourceFile(targetVirtualPath);

  if (!targetSourceFile) {
    return [];
  }

  let targetSymbol: ts.Symbol | undefined;

  function findTargetSymbol(node: ts.Node): void {
    if (targetSymbol) {
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
      const symbol = checker.getSymbolAtLocation(node.name);

      if (symbol) {
        targetSymbol = resolveSymbol(symbol);
      }

      return;
    }

    ts.forEachChild(node, findTargetSymbol);
  }

  findTargetSymbol(targetSourceFile);

  if (!targetSymbol) {
    return [];
  }

  const contexts: RepositorySymbolCallContext[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const normalizedSourceFileName = sourceFile.fileName.replace(/\\/g, "/");

    if (!normalizedSourceFileName.startsWith(`${VIRTUAL_ROOT}/`)) {
      continue;
    }

    const repositoryFilePath = fromVirtualPath(normalizedSourceFileName);

    if (sources[repositoryFilePath] === undefined) {
      continue;
    }

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const symbol = checker.getSymbolAtLocation(node.expression);

        if (symbol && resolveSymbol(symbol) === targetSymbol) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.expression.getStart(sourceFile),
          );

          contexts.push({
            symbolName,
            filePath: repositoryFilePath,
            line: line + 1,
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return contexts;
}
