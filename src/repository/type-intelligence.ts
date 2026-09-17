import ts from "typescript";

export interface ResolvedVariableType {
  typeName: string;
  filePath: string;
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

export function resolveVariableType(
  sources: Record<string, string>,
  filePath: string,
  variableName: string,
): ResolvedVariableType | undefined {
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
  const targetSourceFile = program.getSourceFile(toVirtualPath(filePath));

  if (!targetSourceFile) {
    return undefined;
  }

  let result: ResolvedVariableType | undefined;

  function visit(node: ts.Node): void {
    if (
      result === undefined &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      const isNewExpression =
        node.initializer !== undefined && ts.isNewExpression(node.initializer);

      const hasTypeAnnotation = node.type !== undefined;

      if (isNewExpression || hasTypeAnnotation) {
        const type = checker.getTypeAtLocation(node.name);
        const symbol = type.getSymbol();

        if (symbol) {
          const declaration =
            symbol.valueDeclaration ?? symbol.declarations?.[0];

          if (declaration) {
            const declarationSourceFile = declaration.getSourceFile();
            const normalizedDeclarationPath =
              declarationSourceFile.fileName.replace(/\\/g, "/");

            if (normalizedDeclarationPath.startsWith(`${VIRTUAL_ROOT}/`)) {
              result = {
                typeName: symbol.getName(),
                filePath: fromVirtualPath(normalizedDeclarationPath),
              };
            }
          }
        }
      }
    }

    if (result === undefined) {
      ts.forEachChild(node, visit);
    }
  }

  visit(targetSourceFile);

  return result;
}
