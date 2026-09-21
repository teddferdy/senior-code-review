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

    const targetDeclarations = resolved.declarations ?? [];

    for (const [storedSymbol, node] of functionSymbols.entries()) {
      const storedDeclarations = storedSymbol.declarations ?? [];

      for (const targetDeclaration of targetDeclarations) {
        for (const storedDeclaration of storedDeclarations) {
          if (storedDeclaration === targetDeclaration) {
            return node;
          }

          if (
            storedDeclaration.getSourceFile().fileName ===
              targetDeclaration.getSourceFile().fileName &&
            storedDeclaration.pos === targetDeclaration.pos &&
            storedDeclaration.end === targetDeclaration.end
          ) {
            return node;
          }
        }
      }
    }

    return undefined;
  }

  function getInterfaceMethodImplementation(
    interfaceMethodSymbol: ts.Symbol,
    receiverExpression?: ts.Expression,
  ): ts.Symbol | undefined {
    if (!receiverExpression) {
      return undefined;
    }

    const methodName = resolveSymbol(interfaceMethodSymbol).getName();

    let concreteType: ts.Type | undefined;

    if (ts.isIdentifier(receiverExpression)) {
      const receiverSymbol = checker.getSymbolAtLocation(receiverExpression);

      if (receiverSymbol) {
        const resolvedReceiverSymbol = resolveSymbol(receiverSymbol);

        const declaration =
          resolvedReceiverSymbol.valueDeclaration ??
          resolvedReceiverSymbol.declarations?.[0];

        if (
          declaration &&
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer
        ) {
          concreteType = checker.getTypeAtLocation(declaration.initializer);
        }
      }
    } else {
      concreteType = checker.getTypeAtLocation(receiverExpression);
    }

    if (!concreteType) {
      return undefined;
    }

    const concreteSymbol = concreteType.getSymbol();

    if (!concreteSymbol) {
      return undefined;
    }

    const resolvedConcreteSymbol = resolveSymbol(concreteSymbol);

    for (const declaration of resolvedConcreteSymbol.declarations ?? []) {
      if (!ts.isClassDeclaration(declaration)) {
        continue;
      }

      for (const member of declaration.members) {
        if (!member.name) {
          continue;
        }

        let memberName: string | undefined;

        if (ts.isIdentifier(member.name)) {
          memberName = member.name.text;
        } else if (
          ts.isStringLiteral(member.name) ||
          ts.isNumericLiteral(member.name)
        ) {
          memberName = member.name.text;
        }

        if (memberName !== methodName) {
          continue;
        }

        if (!ts.isMethodDeclaration(member)) {
          continue;
        }

        const methodSymbol = checker.getSymbolAtLocation(member.name);

        if (!methodSymbol) {
          continue;
        }

        const resolvedMethodSymbol = resolveSymbol(methodSymbol);

        if (functionSymbols.has(resolvedMethodSymbol)) {
          return resolvedMethodSymbol;
        }

        for (const [storedSymbol] of functionSymbols.entries()) {
          if (storedSymbol.declarations?.includes(member)) {
            return storedSymbol;
          }

          if (storedSymbol.valueDeclaration === member) {
            return storedSymbol;
          }
        }
      }
    }

    const implementationSymbol = checker.getPropertyOfType(
      concreteType,
      methodName,
    );

    if (!implementationSymbol) {
      return undefined;
    }

    const resolvedImplementation = resolveSymbol(implementationSymbol);

    if (functionSymbols.has(resolvedImplementation)) {
      return resolvedImplementation;
    }

    const implementationDeclarations =
      resolvedImplementation.declarations ?? [];

    for (const [storedSymbol] of functionSymbols.entries()) {
      const storedDeclarations = storedSymbol.declarations ?? [];

      for (const declaration of implementationDeclarations) {
        if (storedDeclarations.includes(declaration)) {
          return storedSymbol;
        }
      }
    }

    return undefined;
  }

  function getReceiverType(
    receiverExpression: ts.Expression,
  ): ts.Type | undefined {
    if (ts.isIdentifier(receiverExpression)) {
      const receiverSymbol = checker.getSymbolAtLocation(receiverExpression);

      if (receiverSymbol) {
        const resolvedReceiverSymbol = resolveSymbol(receiverSymbol);

        const declaration =
          resolvedReceiverSymbol.valueDeclaration ??
          resolvedReceiverSymbol.declarations?.[0];

        if (declaration && ts.isVariableDeclaration(declaration)) {
          if (declaration.type) {
            return checker.getTypeAtLocation(declaration.type);
          }

          if (declaration.initializer) {
            return checker.getTypeAtLocation(declaration.initializer);
          }
        }

        if (declaration && ts.isParameter(declaration)) {
          if (declaration.type) {
            return checker.getTypeAtLocation(declaration.type);
          }

          return checker.getTypeAtLocation(receiverExpression);
        }
      }
    }

    return checker.getTypeAtLocation(receiverExpression);
  }

  function sameDeclaration(
    left: ts.Declaration,
    right: ts.Declaration,
  ): boolean {
    if (left === right) {
      return true;
    }

    return (
      left.getSourceFile().fileName === right.getSourceFile().fileName &&
      left.pos === right.pos &&
      left.end === right.end
    );
  }

  function getTypeDeclarations(type: ts.Type): ts.Declaration[] {
    const symbol = type.getSymbol();

    if (!symbol) {
      return [];
    }

    const resolved = resolveSymbol(symbol);

    return resolved.declarations ?? [];
  }

  function isNominallyCompatibleClass(
    candidate: ts.ClassDeclaration,
    receiverType: ts.Type,
  ): boolean {
    const receiverDeclarations = getTypeDeclarations(receiverType);

    if (receiverDeclarations.length === 0) {
      return false;
    }

    const visited = new Set<ts.Declaration>();

    function visit(
      declaration: ts.ClassDeclaration | ts.InterfaceDeclaration,
    ): boolean {
      if (visited.has(declaration)) {
        return false;
      }

      visited.add(declaration);

      for (const receiverDeclaration of receiverDeclarations) {
        if (sameDeclaration(declaration, receiverDeclaration)) {
          return true;
        }
      }

      for (const heritageClause of declaration.heritageClauses ?? []) {
        const isRelevantClassHeritage =
          ts.isClassDeclaration(declaration) &&
          (heritageClause.token === ts.SyntaxKind.ExtendsKeyword ||
            heritageClause.token === ts.SyntaxKind.ImplementsKeyword);

        const isRelevantInterfaceHeritage =
          ts.isInterfaceDeclaration(declaration) &&
          heritageClause.token === ts.SyntaxKind.ExtendsKeyword;

        if (!isRelevantClassHeritage && !isRelevantInterfaceHeritage) {
          continue;
        }

        for (const typeNode of heritageClause.types) {
          const baseSymbol = checker.getSymbolAtLocation(typeNode.expression);

          if (!baseSymbol) {
            continue;
          }

          const resolvedBaseSymbol = resolveSymbol(baseSymbol);

          for (const baseDeclaration of resolvedBaseSymbol.declarations ?? []) {
            if (
              ts.isClassDeclaration(baseDeclaration) ||
              ts.isInterfaceDeclaration(baseDeclaration)
            ) {
              if (visit(baseDeclaration)) {
                return true;
              }
            }
          }
        }
      }

      return false;
    }

    return visit(candidate);
  }

  function isPolymorphicReceiver(receiverExpression: ts.Expression): boolean {
    if (!ts.isIdentifier(receiverExpression)) {
      return false;
    }

    const receiverSymbol = checker.getSymbolAtLocation(receiverExpression);

    if (!receiverSymbol) {
      return false;
    }

    const resolvedReceiverSymbol = resolveSymbol(receiverSymbol);

    const declaration =
      resolvedReceiverSymbol.valueDeclaration ??
      resolvedReceiverSymbol.declarations?.[0];

    if (!declaration || !ts.isParameter(declaration)) {
      return false;
    }

    return Boolean(declaration.type);
  }

  function getPolymorphicMethodImplementations(
    methodName: string,
    receiverType: ts.Type,
  ): ts.Symbol[] {
    const implementations: ts.Symbol[] = [];
    const seenDeclarations = new Set<ts.Declaration>();

    function addImplementation(
      implementationSymbol: ts.Symbol | undefined,
    ): void {
      if (!implementationSymbol) {
        return;
      }

      const resolvedImplementation = resolveSymbol(implementationSymbol);

      for (const declaration of resolvedImplementation.declarations ?? []) {
        if (seenDeclarations.has(declaration)) {
          continue;
        }

        seenDeclarations.add(declaration);
        implementations.push(resolvedImplementation);
      }
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
        if (ts.isClassDeclaration(node)) {
          /*
           * Only classes that are nominally related to the
           * receiver type participate in polymorphic dispatch.
           *
           * This intentionally does not use
           * checker.isTypeAssignableTo(), because TypeScript
           * uses structural typing and an unrelated class with
           * the same public shape could otherwise be included.
           */
          if (isNominallyCompatibleClass(node, receiverType)) {
            const classType = checker.getTypeAtLocation(node);

            const implementationSymbol = checker.getPropertyOfType(
              classType,
              methodName,
            );

            addImplementation(implementationSymbol);
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    return implementations;
  }

  /*
   * Strip parenthesized and non-null-assertion wrappers around a call's
   * callee expression.
   *
   * (s.run)(), ((helper))(), (s["run"])(), helper!(), s.run!(),
   * s["run"]!(), (s.run)!() and (helper!)() are semantically
   * identical to their unwrapped forms.
   */
  function unwrapCalleeExpression(expression: ts.Expression): ts.Expression {
    let current = expression;

    while (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
    }

    return current;
  }

  /*
   * Index functions, methods and function-valued properties.
   */
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
        (ts.isIdentifier(node.name) ||
          ts.isStringLiteral(node.name) ||
          ts.isNumericLiteral(node.name) ||
          ts.isComputedPropertyName(node.name))
      ) {
        const isConstructor =
          ts.isIdentifier(node.name) && node.name.text === "constructor";

        if (isConstructor) {
          // Constructors are intentionally excluded.
        } else {
          const symbol = checker.getSymbolAtLocation(node.name);

          if (symbol) {
            const resolved = resolveSymbol(symbol);

            /*
             * Dynamically-keyed methods (e.g. [getKey()]) have no
             * statically-known name and remain unresolved.
             */
            if (resolved.getName() !== "__computed") {
              const { line } = sourceFile.getLineAndCharacterOfPosition(
                node.name.getStart(sourceFile),
              );

              functionSymbols.set(resolved, {
                symbolName: ts.isComputedPropertyName(node.name)
                  ? resolved.getName()
                  : node.name.text,
                filePath,
                line: line + 1,
              });
            }
          }
        }
      } else if (
        ts.isVariableDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
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
        ts.isPropertyDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
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
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) ||
          ts.isStringLiteral(node.name) ||
          ts.isNumericLiteral(node.name) ||
          ts.isComputedPropertyName(node.name)) &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        let symbol: ts.Symbol | undefined;

        if (ts.isComputedPropertyName(node.name)) {
          const expression = node.name.expression;

          if (
            ts.isStringLiteral(expression) ||
            ts.isNumericLiteral(expression) ||
            ts.isNoSubstitutionTemplateLiteral(expression) ||
            ts.isTemplateExpression(expression) ||
            ts.isIdentifier(expression)
          ) {
            const objectLiteral = node.parent;

            if (ts.isObjectLiteralExpression(objectLiteral)) {
              const objectType = checker.getTypeAtLocation(objectLiteral);

              if (
                ts.isIdentifier(expression) ||
                ts.isTemplateExpression(expression)
              ) {
                const expressionType = checker.getTypeAtLocation(expression);

                if (
                  expressionType.isStringLiteral() ||
                  expressionType.isNumberLiteral()
                ) {
                  symbol = checker.getPropertyOfType(
                    objectType,
                    expressionType.value.toString(),
                  );
                }
              } else {
                symbol = checker.getPropertyOfType(objectType, expression.text);
              }
            }
          }
        } else {
          symbol = checker.getSymbolAtLocation(node.name);
        }

        if (symbol) {
          const resolved = resolveSymbol(symbol);

          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.name.getStart(sourceFile),
          );

          let symbolName: string;

          if (ts.isComputedPropertyName(node.name)) {
            const expression = node.name.expression;

            if (
              ts.isStringLiteral(expression) ||
              ts.isNumericLiteral(expression) ||
              ts.isNoSubstitutionTemplateLiteral(expression)
            ) {
              symbolName = expression.text;
            } else if (ts.isTemplateExpression(expression)) {
              const expressionType = checker.getTypeAtLocation(expression);

              if (
                expressionType.isStringLiteral() ||
                expressionType.isNumberLiteral()
              ) {
                symbolName = expressionType.value.toString();
              } else {
                symbolName = expression.getText(sourceFile);
              }
            } else if (ts.isIdentifier(expression)) {
              const expressionType = checker.getTypeAtLocation(expression);

              if (
                expressionType.isStringLiteral() ||
                expressionType.isNumberLiteral()
              ) {
                symbolName = expressionType.value.toString();
              } else {
                symbolName = expression.getText(sourceFile);
              }
            } else {
              symbolName = expression.getText(sourceFile);
            }
          } else {
            symbolName = node.name.text;
          }

          functionSymbols.set(resolved, {
            symbolName,
            filePath,
            line: line + 1,
          });
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

    function getCallerByDeclaration(
      declaration: ts.Declaration,
    ): CallGraphNode | undefined {
      for (const [storedSymbol, node] of functionSymbols.entries()) {
        const storedDeclarations = storedSymbol.declarations ?? [];

        for (const storedDeclaration of storedDeclarations) {
          if (storedDeclaration === declaration) {
            return node;
          }

          if (
            storedDeclaration.getSourceFile().fileName ===
              declaration.getSourceFile().fileName &&
            storedDeclaration.pos === declaration.pos &&
            storedDeclaration.end === declaration.end
          ) {
            return node;
          }
        }

        if (storedSymbol.valueDeclaration === declaration) {
          return node;
        }
      }

      return undefined;
    }

    function getPropertyAssignmentCallerSymbol(
      node: ts.PropertyAssignment,
    ): ts.Symbol | undefined {
      if (ts.isComputedPropertyName(node.name)) {
        const expression = node.name.expression;

        if (
          ts.isStringLiteral(expression) ||
          ts.isNumericLiteral(expression) ||
          ts.isNoSubstitutionTemplateLiteral(expression) ||
          ts.isTemplateExpression(expression) ||
          ts.isIdentifier(expression)
        ) {
          const objectLiteral = node.parent;

          if (ts.isObjectLiteralExpression(objectLiteral)) {
            const objectType = checker.getTypeAtLocation(objectLiteral);

            if (
              ts.isIdentifier(expression) ||
              ts.isTemplateExpression(expression)
            ) {
              const expressionType = checker.getTypeAtLocation(expression);

              if (
                expressionType.isStringLiteral() ||
                expressionType.isNumberLiteral()
              ) {
                return checker.getPropertyOfType(
                  objectType,
                  expressionType.value.toString(),
                );
              }

              return undefined;
            }

            return checker.getPropertyOfType(objectType, expression.text);
          }
        }

        return undefined;
      }

      return checker.getSymbolAtLocation(node.name);
    }

    function findCaller(node: ts.Node): CallGraphNode | undefined {
      let current: ts.Node | undefined = node.parent;

      while (current) {
        if (ts.isFunctionDeclaration(current) && current.name) {
          const symbol = checker.getSymbolAtLocation(current.name);

          if (symbol) {
            const caller = getCalleeNode(symbol);

            if (caller) {
              return caller;
            }
          }

          const byDeclaration = getCallerByDeclaration(current);

          if (byDeclaration) {
            return byDeclaration;
          }
        } else if (
          ts.isMethodDeclaration(current) &&
          current.name &&
          (ts.isIdentifier(current.name) ||
            ts.isStringLiteral(current.name) ||
            ts.isNumericLiteral(current.name) ||
            ts.isComputedPropertyName(current.name))
        ) {
          const isConstructor =
            ts.isIdentifier(current.name) &&
            current.name.text === "constructor";

          if (!isConstructor) {
            const symbol = checker.getSymbolAtLocation(current.name);

            if (symbol) {
              const caller = getCalleeNode(symbol);

              if (caller) {
                return caller;
              }
            }

            const byDeclaration = getCallerByDeclaration(current);

            if (byDeclaration) {
              return byDeclaration;
            }
          }
        } else if (
          ts.isVariableDeclaration(current) &&
          current.name &&
          ts.isIdentifier(current.name) &&
          current.initializer &&
          (ts.isArrowFunction(current.initializer) ||
            ts.isFunctionExpression(current.initializer))
        ) {
          const symbol = checker.getSymbolAtLocation(current.name);

          if (symbol) {
            const caller = getCalleeNode(symbol);

            if (caller) {
              return caller;
            }
          }

          const byDeclaration = getCallerByDeclaration(current);

          if (byDeclaration) {
            return byDeclaration;
          }
        } else if (
          ts.isPropertyDeclaration(current) &&
          current.name &&
          ts.isIdentifier(current.name) &&
          current.initializer &&
          (ts.isArrowFunction(current.initializer) ||
            ts.isFunctionExpression(current.initializer))
        ) {
          const symbol = checker.getSymbolAtLocation(current.name);

          if (symbol) {
            const caller = getCalleeNode(symbol);

            if (caller) {
              return caller;
            }
          }

          const byDeclaration = getCallerByDeclaration(current);

          if (byDeclaration) {
            return byDeclaration;
          }
        } else if (
          ts.isPropertyAssignment(current) &&
          (ts.isIdentifier(current.name) ||
            ts.isStringLiteral(current.name) ||
            ts.isNumericLiteral(current.name) ||
            ts.isComputedPropertyName(current.name)) &&
          (ts.isArrowFunction(current.initializer) ||
            ts.isFunctionExpression(current.initializer))
        ) {
          const symbol = getPropertyAssignmentCallerSymbol(current);

          if (symbol) {
            const caller = getCalleeNode(symbol);

            if (caller) {
              return caller;
            }
          }

          const byDeclaration = getCallerByDeclaration(current);

          if (byDeclaration) {
            return byDeclaration;
          }
        }

        current = current.parent;
      }

      return undefined;
    }

    function visit(node: ts.Node): void {
      const calleeExpression = ts.isCallExpression(node)
        ? unwrapCalleeExpression(node.expression)
        : undefined;

      if (
        calleeExpression &&
        (ts.isIdentifier(calleeExpression) ||
          ts.isPropertyAccessExpression(calleeExpression) ||
          ts.isElementAccessExpression(calleeExpression))
      ) {
        const caller = findCaller(node);

        if (!caller) {
          ts.forEachChild(node, visit);
          return;
        }

        let calleeSymbol: ts.Symbol | undefined;

        if (ts.isElementAccessExpression(calleeExpression)) {
          const objectType = checker.getNonNullableType(
            checker.getTypeAtLocation(calleeExpression.expression),
          );

          const argument = calleeExpression.argumentExpression;

          if (
            argument &&
            (ts.isStringLiteral(argument) ||
              ts.isNumericLiteral(argument) ||
              ts.isNoSubstitutionTemplateLiteral(argument) ||
              ts.isTemplateExpression(argument) ||
              ts.isIdentifier(argument) ||
              ts.isPropertyAccessExpression(argument))
          ) {
            let propertyName: string | undefined;

            if (
              ts.isStringLiteral(argument) ||
              ts.isNumericLiteral(argument) ||
              ts.isNoSubstitutionTemplateLiteral(argument)
            ) {
              propertyName = argument.text;
            } else {
              const argumentType = checker.getTypeAtLocation(argument);

              if (
                argumentType.isStringLiteral() ||
                argumentType.isNumberLiteral()
              ) {
                propertyName = argumentType.value.toString();
              }
            }

            if (propertyName !== undefined) {
              calleeSymbol = checker.getPropertyOfType(
                objectType,
                propertyName,
              );
            }
          }
        } else {
          calleeSymbol = checker.getSymbolAtLocation(calleeExpression);
        }

        if (calleeSymbol) {
          const callees: CallGraphNode[] = [];

          const directCallee = getCalleeNode(calleeSymbol);

          if (directCallee) {
            callees.push(directCallee);
          }

          if (
            ts.isPropertyAccessExpression(calleeExpression) ||
            ts.isElementAccessExpression(calleeExpression)
          ) {
            const receiverExpression = calleeExpression.expression;

            /*
             * Preserve Phase 6.4 interface/concrete
             * implementation resolution.
             */
            const implementationSymbol = getInterfaceMethodImplementation(
              calleeSymbol,
              receiverExpression,
            );

            if (implementationSymbol) {
              const implementation = getCalleeNode(implementationSymbol);

              if (
                implementation &&
                !callees.some(
                  (existing) =>
                    existing.filePath === implementation.filePath &&
                    existing.line === implementation.line &&
                    existing.symbolName === implementation.symbolName,
                )
              ) {
                callees.push(implementation);
              }
            }

            /*
             * Phase 6.6 polymorphic dispatch.
             *
             * Only expand calls where the receiver is a
             * typed parameter. This represents an unknown
             * runtime concrete implementation.
             *
             * Example:
             *
             * function consumer(service: UserService) {
             *   service.getUser();
             * }
             *
             * Possible implementations:
             *
             * UserService.getUser
             * AdminService.getUser
             */
            if (isPolymorphicReceiver(receiverExpression)) {
              const receiverType = getReceiverType(receiverExpression);

              if (receiverType) {
                const polymorphicSymbols = getPolymorphicMethodImplementations(
                  resolveSymbol(calleeSymbol).getName(),
                  receiverType,
                );

                for (const polymorphicSymbol of polymorphicSymbols) {
                  const polymorphicCallee = getCalleeNode(polymorphicSymbol);

                  if (
                    polymorphicCallee &&
                    !callees.some(
                      (existing) =>
                        existing.filePath === polymorphicCallee.filePath &&
                        existing.line === polymorphicCallee.line &&
                        existing.symbolName === polymorphicCallee.symbolName,
                    )
                  ) {
                    callees.push(polymorphicCallee);
                  }
                }
              }
            }
          }

          if (callees.length > 0) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              calleeExpression.getStart(sourceFile),
            );

            for (const callee of callees) {
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
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return { edges };
}
