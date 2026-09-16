import ts from "typescript";

export interface ResolvedSymbolReference {
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

export function resolveSymbolReferences(
  sources: Record<string, string>,
  filePath: string,
  symbolName: string,
): ResolvedSymbolReference[] {
  const targetSourceCode = sources[filePath];

  if (targetSourceCode === undefined) {
    return [];
  }

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
    const normalized = directoryName.replace(/\\/g, "/").replace(/\/+$/, "") || "/";

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

  const virtualEntryPoints = [...virtualSources.keys()];

  const program = ts.createProgram(virtualEntryPoints, compilerOptions, host);

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
  let declaration: ts.Declaration | undefined;

  function findDeclaration(node: ts.Node): void {
    if (targetSymbol) return;

    if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
      const symbol = checker.getSymbolAtLocation(node.name);

      if (!symbol) return;

      targetSymbol = resolveSymbol(symbol);
      declaration = node;

      return;
    }

    ts.forEachChild(node, findDeclaration);
  }

  findDeclaration(targetSourceFile);

  if (!targetSymbol) {
    return [];
  }

  const references: ResolvedSymbolReference[] = [];

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
      if (ts.isIdentifier(node) && node.text === symbolName) {
        const symbol = checker.getSymbolAtLocation(node);

        if (symbol && resolveSymbol(symbol) === targetSymbol) {
          if (repositoryFilePath === filePath && node.parent === declaration) {
            ts.forEachChild(node, visit);
            return;
          }

          // Exclude import binding declarations (e.g., `import { foo }` itself is not a usage)
          if (
            node.parent &&
            (ts.isImportSpecifier(node.parent) ||
              ts.isImportClause(node.parent) ||
              (ts as any).isNamespaceImport?.(node.parent))
          ) {
            ts.forEachChild(node, visit);
            return;
          }

          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );

          references.push({
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

  return references;
}
