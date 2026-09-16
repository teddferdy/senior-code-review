import ts from "typescript";

export interface CallGraphNode {
  symbolName: string;
  filePath: string;
  line: number;
}

export interface CallGraphEdge {
  caller: CallGraphNode;
  callee: CallGraphNode;
  callSite: {
    filePath: string;
    line: number;
  };
}

export interface CallGraph {
  edges: CallGraphEdge[];
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

export function buildCallGraph(sources: Record<string, string>): CallGraph {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    strict: true,
  };

  const virtualSources = new Map<string, string>();

  for (const [filePath, sourceCode] of Object.entries(sources)) {
    virtualSources.set(toVirtualPath(filePath), sourceCode);
  }

  const baseHost = ts.createCompilerHost(compilerOptions);
  const host = ts.createCompilerHost(compilerOptions);

  host.getSourceFile = (
    requestedFileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    const normalized = requestedFileName.replace(/\\/g, "/");
    const sourceCode = virtualSources.get(normalized);

    if (sourceCode !== undefined) {
      return ts.createSourceFile(
        requestedFileName,
        sourceCode,
        languageVersion,
        true,
      );
    }

    return baseHost.getSourceFile(
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    );
  };

  host.fileExists = (requestedFileName) => {
    const normalized = requestedFileName.replace(/\\/g, "/");

    if (virtualSources.has(normalized)) {
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
    const normalized = requestedFileName.replace(/\\/g, "/");
    const sourceCode = virtualSources.get(normalized);

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

  const functionSymbols = new Map<ts.Symbol, CallGraphNode>();

  function getCalleeNode(calleeSymbol: ts.Symbol): CallGraphNode | undefined {
    const resolved = resolveSymbol(calleeSymbol);
    const direct = functionSymbols.get(resolved);

    if (direct) {
      return direct;
    }

    // Fallback for class methods: TypeChecker may return a distinct Symbol
    // instance for a method access (e.g., service.run()) vs the declaration
    // symbol. They share the same declaration node, so compare by declaration
    // identity to resolve the callee.
    const targetDecl =
      resolved.valueDeclaration ?? resolved.declarations?.[0];

    if (!targetDecl) {
      return undefined;
    }

    for (const [storedSymbol, node] of functionSymbols.entries()) {
      const storedDecl =
        storedSymbol.valueDeclaration ?? storedSymbol.declarations?.[0];

      if (storedDecl === targetDecl) {
        return node;
      }

      if (resolved.declarations && storedSymbol.declarations) {
        for (const decl of resolved.declarations) {
          if (storedSymbol.declarations.includes(decl)) {
            return node;
          }
        }
      }
    }

    return undefined;
  }

  for (const sourceFile of program.getSourceFiles()) {
    const normalizedPath = sourceFile.fileName.replace(/\\/g, "/");

    if (!normalizedPath.startsWith(`${VIRTUAL_ROOT}/`)) {
      continue;
    }

    const filePath = fromVirtualPath(normalizedPath);

    if (sources[filePath] === undefined) {
      continue;
    }

    function visit(node: ts.Node): void {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const symbol = checker.getSymbolAtLocation(node.name);

        if (symbol) {
          const resolved = resolveSymbol(symbol);
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.name.getStart(sourceFile),
          );

          functionSymbols.set(resolved, {
            symbolName: node.name.text,
            filePath,
            line: line + 1,
          });
        }
      } else if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        // Strict scope: skip constructor methods
        if (node.name.text === "constructor") {
          // do not index constructors
        } else {
          const symbol = checker.getSymbolAtLocation(node.name);

          if (symbol) {
            const resolved = resolveSymbol(symbol);
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.name.getStart(sourceFile),
            );

            functionSymbols.set(resolved, {
              symbolName: node.name.text,
              filePath,
              line: line + 1,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  const edges: CallGraphEdge[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const normalizedPath = sourceFile.fileName.replace(/\\/g, "/");

    if (!normalizedPath.startsWith(`${VIRTUAL_ROOT}/`)) {
      continue;
    }

    const filePath = fromVirtualPath(normalizedPath);

    if (sources[filePath] === undefined) {
      continue;
    }

    function findCaller(node: ts.Node): CallGraphNode | undefined {
      let current: ts.Node | undefined = node.parent;

      while (current) {
        if (ts.isFunctionDeclaration(current) && current.name) {
          const symbol = checker.getSymbolAtLocation(current.name);

          if (symbol) {
            return functionSymbols.get(resolveSymbol(symbol));
          }
        }

        current = current.parent;
      }

      return undefined;
    }

    function visit(node: ts.Node): void {
      if (
        ts.isCallExpression(node) &&
        (ts.isIdentifier(node.expression) ||
          ts.isPropertyAccessExpression(node.expression))
      ) {
        const caller = findCaller(node);

        if (!caller) {
          ts.forEachChild(node, visit);
          return;
        }

        const calleeSymbol = checker.getSymbolAtLocation(node.expression);

        if (calleeSymbol) {
          const callee = getCalleeNode(calleeSymbol);

          if (callee) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.expression.getStart(sourceFile),
            );

            edges.push({
              caller,
              callee,
              callSite: {
                filePath,
                line: line + 1,
              },
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return { edges };
}
