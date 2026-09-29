import ts from "typescript";

import type { AnalysisContext } from "./analysis-context.js";
import { fromAnalysisVirtualPath } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationKind,
  DeclarationRecord,
} from "./declaration-ids.js";

/*
 * V1 source-backed call-graph construction.
 *
 * Pure derivation over an existing AnalysisContext. Reuses the context's
 * owned ts.Program and ts.TypeChecker; never creates another program,
 * host, or resolution pipeline. Caller and callee are stable V1
 * DeclarationIds resolved through the existing declaration tables.
 *
 * Behavioral reference: the frozen legacy buildCallGraph() (index set,
 * caller walk, callee resolution, interface/concrete dispatch, typed-
 * parameter polymorphic expansion, wrapper unwrapping). Legacy output
 * and semantics are untouched; this module is additive.
 *
 * Locked semantics:
 * - edges carry DeclarationIds only (SymbolId stays derivable via
 *   declarationOf); overloads target the specific overload declaration.
 * - unresolvable sides are omitted, never guessed.
 * - edge identity is (callerId, calleeId, callSite.file, callSite.line).
 * - output is sorted deterministically; no dependence on traversal order.
 */

export interface V1CallSite {
  file: CanonicalPath;
  line: number;
}

export interface V1CallEdge {
  callerId: DeclarationId;
  calleeId: DeclarationId;
  callSite: V1CallSite;
}

export interface V1CallGraph {
  edges: V1CallEdge[];
}

const CALLABLE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "function",
  "method",
  "overload",
  "objectMethod",
]);

const CONDITIONALLY_CALLABLE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "property",
  "variable",
]);

function anchorKey(file: CanonicalPath, startOffset: number): string {
  return `${file}\0${startOffset}`;
}

function safeStart(node: ts.Node): number | undefined {
  try {
    const start = node.getStart();

    return start >= 0 ? start : undefined;
  } catch {
    return undefined;
  }
}

/*
 * Mirrors the function-valued rule used by the V1 identity tables
 * (declaration-ids.ts isFunctionLikeInitializer): only arrow-function
 * and function-expression initializers (through transparent wrappers)
 * make a variable/property declaration callable.
 */
function isFunctionValued(node: ts.Node): boolean {
  let initializer: ts.Expression | undefined;

  if (ts.isVariableDeclaration(node)) {
    if (!node.name || !ts.isIdentifier(node.name) || !node.initializer) {
      return false;
    }

    initializer = node.initializer;
  } else if (ts.isPropertyDeclaration(node)) {
    if (!node.initializer) {
      return false;
    }

    initializer = node.initializer;
  } else {
    return false;
  }

  let current: ts.Expression = initializer;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return ts.isArrowFunction(current) || ts.isFunctionExpression(current);
}

/*
 * Strip parenthesized, non-null-assertion and type-assertion wrappers.
 * Ports the legacy unwrapExpression rule verbatim.
 */
function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function compareV1CallEdges(left: V1CallEdge, right: V1CallEdge): number {
  if (left.callerId !== right.callerId) {
    return left.callerId < right.callerId ? -1 : 1;
  }

  if (left.calleeId !== right.calleeId) {
    return left.calleeId < right.calleeId ? -1 : 1;
  }

  if (left.callSite.file !== right.callSite.file) {
    return left.callSite.file < right.callSite.file ? -1 : 1;
  }

  if (left.callSite.line !== right.callSite.line) {
    return left.callSite.line < right.callSite.line ? -1 : 1;
  }

  return 0;
}

export function buildV1CallGraph(context: AnalysisContext): V1CallGraph {
  const program = context.program;
  const checker = context.checker;

  const canonicalSet = new Set<CanonicalPath>(context.canonicalPaths);
  const records = context.allDeclarations();

  const recordByAnchor = new Map<string, DeclarationRecord>();

  for (const record of records) {
    recordByAnchor.set(anchorKey(record.file, record.startOffset), record);
  }

  function canonicalOfFile(sourceFile: ts.SourceFile): CanonicalPath | undefined {
    const normalized = sourceFile.fileName.replace(/\\/g, "/");
    const canonical = fromAnalysisVirtualPath(normalized) as CanonicalPath;

    return canonicalSet.has(canonical) ? canonical : undefined;
  }

  function recordAt(node: ts.Node): DeclarationRecord | undefined {
    const start = safeStart(node);

    if (start === undefined) {
      return undefined;
    }

    let sourceFile: ts.SourceFile;

    try {
      sourceFile = node.getSourceFile();
    } catch {
      return undefined;
    }

    const canonical = canonicalOfFile(sourceFile);

    if (canonical === undefined) {
      return undefined;
    }

    return recordByAnchor.get(anchorKey(canonical, start));
  }

  function isEligibleRecord(
    record: DeclarationRecord | undefined,
    node: ts.Node,
  ): record is DeclarationRecord {
    if (!record) {
      return false;
    }

    if (CALLABLE_KINDS.has(record.kind)) {
      return true;
    }

    if (CONDITIONALLY_CALLABLE_KINDS.has(record.kind)) {
      return isFunctionValued(node);
    }

    return false;
  }

  /*
   * Eligible declaration IDs keyed by anchor. A single AST walk per file
   * populates this; node access here is what allows the function-valued
   * gate for variable/property declarations.
   */
  const eligibleByAnchor = new Map<string, DeclarationId>();

  const sourceFiles = new Map<CanonicalPath, ts.SourceFile>();

  for (const canonicalPath of context.canonicalPaths) {
    const sourceFile = program.getSourceFile(
      context.toVirtualPath(canonicalPath),
    );

    if (sourceFile) {
      sourceFiles.set(canonicalPath, sourceFile);
    }
  }

  for (const [canonicalPath, sourceFile] of sourceFiles) {
    function visit(node: ts.Node): void {
      const record = recordAt(node);

      if (record && isEligibleRecord(record, node)) {
        const start = safeStart(node);

        if (start !== undefined) {
          eligibleByAnchor.set(anchorKey(canonicalPath, start), record.id);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  function resolveSymbol(symbol: ts.Symbol): ts.Symbol {
    if (symbol.flags & ts.SymbolFlags.Alias) {
      try {
        return checker.getAliasedSymbol(symbol);
      } catch {
        return symbol;
      }
    }

    return symbol;
  }

  /*
   * All eligible V1 declaration IDs for an (alias-resolved) ts.Symbol,
   * via the symbol's declarations matched on (file, startOffset).
   */
  function idsForSymbol(symbol: ts.Symbol): DeclarationId[] {
    let resolved: ts.Symbol;

    try {
      resolved = resolveSymbol(symbol);
    } catch {
      return [];
    }

    let declarations: readonly ts.Declaration[];

    try {
      declarations = resolved.declarations ?? [];
    } catch {
      return [];
    }

    const ids: DeclarationId[] = [];
    const seen = new Set<DeclarationId>();

    for (const declaration of declarations) {
      let sourceFile: ts.SourceFile;

      try {
        sourceFile = declaration.getSourceFile();
      } catch {
        continue;
      }

      const canonical = canonicalOfFile(sourceFile);

      if (canonical === undefined) {
        continue;
      }

      const start = safeStart(declaration);

      if (start === undefined) {
        continue;
      }

      const id = eligibleByAnchor.get(anchorKey(canonical, start));

      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    return ids;
  }

  function idForAnchor(node: ts.Node): DeclarationId | undefined {
    const start = safeStart(node);

    if (start === undefined) {
      return undefined;
    }

    let sourceFile: ts.SourceFile;

    try {
      sourceFile = node.getSourceFile();
    } catch {
      return undefined;
    }

    const canonical = canonicalOfFile(sourceFile);

    if (canonical === undefined) {
      return undefined;
    }

    return eligibleByAnchor.get(anchorKey(canonical, start));
  }

  function symbolAtLocation(node: ts.Node): ts.Symbol | undefined {
    try {
      return checker.getSymbolAtLocation(node);
    } catch {
      return undefined;
    }
  }

  /*
   * Overload selection: among the symbol's eligible V1 declarations,
   * select the exact declaration chosen by the checker's resolved
   * signature. Single-candidate symbols need no disambiguation; zero
   * candidates or an unmappable signature means omission, never a guess.
   */
  function selectCalleeId(
    candidates: readonly DeclarationId[],
    call: ts.CallExpression,
  ): DeclarationId | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    let signatureDeclaration: ts.Node | undefined;

    try {
      const signature = checker.getResolvedSignature(call);
      const declaration = signature?.declaration;

      if (declaration && typeof (declaration as ts.Node).getStart === "function") {
        signatureDeclaration = declaration as ts.Node;
      }
    } catch {
      signatureDeclaration = undefined;
    }

    if (!signatureDeclaration) {
      return undefined;
    }

    let sourceFile: ts.SourceFile;

    try {
      sourceFile = signatureDeclaration.getSourceFile();
    } catch {
      return undefined;
    }

    const canonical = canonicalOfFile(sourceFile);

    if (canonical === undefined) {
      return undefined;
    }

    const start = safeStart(signatureDeclaration);

    if (start === undefined) {
      return undefined;
    }

    const wanted = eligibleByAnchor.get(anchorKey(canonical, start));

    if (wanted === undefined) {
      return undefined;
    }

    return candidates.includes(wanted) ? wanted : undefined;
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
      const receiverSymbol = symbolAtLocation(receiverExpression);

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
          try {
            concreteType = checker.getTypeAtLocation(declaration.initializer);
          } catch {
            concreteType = undefined;
          }
        }
      }
    } else {
      try {
        concreteType = checker.getTypeAtLocation(receiverExpression);
      } catch {
        concreteType = undefined;
      }
    }

    if (!concreteType) {
      return undefined;
    }

    let concreteSymbol: ts.Symbol | undefined;

    try {
      concreteSymbol = concreteType.getSymbol();
    } catch {
      return undefined;
    }

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

        const methodSymbol = symbolAtLocation(member.name);

        if (!methodSymbol) {
          continue;
        }

        // Eligibility gating happens in the edge walk via idsForSymbol;
        // returning the symbol here mirrors the legacy structure.
        return methodSymbol;
      }
    }

    let implementationSymbol: ts.Symbol | undefined;

    try {
      implementationSymbol =
        checker.getPropertyOfType(concreteType, methodName) ?? undefined;
    } catch {
      return undefined;
    }

    return implementationSymbol;
  }

  function sameDeclaration(
    left: ts.Declaration,
    right: ts.Declaration,
  ): boolean {
    if (left === right) {
      return true;
    }

    try {
      return (
        left.getSourceFile().fileName === right.getSourceFile().fileName &&
        left.pos === right.pos &&
        left.end === right.end
      );
    } catch {
      return false;
    }
  }

  function getTypeDeclarations(type: ts.Type): ts.Declaration[] {
    let symbol: ts.Symbol | undefined;

    try {
      symbol = type.getSymbol();
    } catch {
      return [];
    }

    if (!symbol) {
      return [];
    }

    const resolved = resolveSymbol(symbol);

    return [...(resolved.declarations ?? [])];
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
          const baseSymbol = symbolAtLocation(typeNode.expression);

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

  function getReceiverType(
    receiverExpression: ts.Expression,
  ): ts.Type | undefined {
    if (ts.isIdentifier(receiverExpression)) {
      const receiverSymbol = symbolAtLocation(receiverExpression);

      if (receiverSymbol) {
        const resolvedReceiverSymbol = resolveSymbol(receiverSymbol);

        const declaration =
          resolvedReceiverSymbol.valueDeclaration ??
          resolvedReceiverSymbol.declarations?.[0];

        if (declaration && ts.isVariableDeclaration(declaration)) {
          if (declaration.type) {
            try {
              return checker.getTypeAtLocation(declaration.type);
            } catch {
              return undefined;
            }
          }

          if (declaration.initializer) {
            try {
              return checker.getTypeAtLocation(declaration.initializer);
            } catch {
              return undefined;
            }
          }
        }

        if (declaration && ts.isParameter(declaration)) {
          if (declaration.type) {
            try {
              return checker.getTypeAtLocation(declaration.type);
            } catch {
              return undefined;
            }
          }

          try {
            return checker.getTypeAtLocation(receiverExpression);
          } catch {
            return undefined;
          }
        }
      }
    }

    try {
      return checker.getTypeAtLocation(receiverExpression);
    } catch {
      return undefined;
    }
  }

  function isPolymorphicReceiver(receiverExpression: ts.Expression): boolean {
    if (!ts.isIdentifier(receiverExpression)) {
      return false;
    }

    const receiverSymbol = symbolAtLocation(receiverExpression);

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

    for (const [, sourceFile] of sourceFiles) {

      function visit(node: ts.Node): void {
        if (ts.isClassDeclaration(node)) {
          /*
           * Only nominally related classes participate, mirroring the
           * legacy rule (call-graph.ts): structural assignability is
           * intentionally not used.
           */
          if (isNominallyCompatibleClass(node, receiverType)) {
            let classType: ts.Type | undefined;

            try {
              classType = checker.getTypeAtLocation(node);
            } catch {
              classType = undefined;
            }

            if (classType) {
              let implementationSymbol: ts.Symbol | undefined;

              try {
                implementationSymbol =
                  checker.getPropertyOfType(classType, methodName) ??
                  undefined;
              } catch {
                implementationSymbol = undefined;
              }

              addImplementation(implementationSymbol);
            }
          }
        }

        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    return implementations;
  }

  function getPropertyAssignmentCalleeSymbol(
    node: ts.PropertyAssignment,
  ): ts.Symbol | undefined {
    if (ts.isComputedPropertyName(node.name)) {
      const rawExpression = node.name.expression;
      const expression = unwrapExpression(
        rawExpression as ts.Expression,
      ) as ts.Expression;

      if (
        ts.isStringLiteral(expression) ||
        ts.isNumericLiteral(expression) ||
        ts.isNoSubstitutionTemplateLiteral(expression) ||
        ts.isTemplateExpression(expression) ||
        ts.isIdentifier(expression)
      ) {
        const objectLiteral = node.parent;

        if (ts.isObjectLiteralExpression(objectLiteral)) {
          let objectType: ts.Type | undefined;

          try {
            objectType = checker.getTypeAtLocation(objectLiteral);
          } catch {
            return undefined;
          }

          if (
            ts.isIdentifier(expression) ||
            ts.isTemplateExpression(expression)
          ) {
            let expressionType: ts.Type | undefined;

            try {
              expressionType = checker.getTypeAtLocation(expression);
            } catch {
              return undefined;
            }

            if (
              expressionType.isStringLiteral() ||
              expressionType.isNumberLiteral()
            ) {
              try {
                return (
                  checker.getPropertyOfType(
                    objectType,
                    expressionType.value.toString(),
                  ) ?? undefined
                );
              } catch {
                return undefined;
              }
            }

            return undefined;
          }

          try {
            return (
              checker.getPropertyOfType(objectType, expression.text) ??
              undefined
            );
          } catch {
            return undefined;
          }
        }
      }

      return undefined;
    }

    return symbolAtLocation(node.name);
  }

  /*
   * Nearest enclosing eligible function-like declaration, innermost
   * first — ports the legacy findCaller traversal. Anchors without an
   * eligible V1 record (constructors, accessors, unindexed constructs,
   * top-level code) are skipped outward; absence means omission.
   */
  function findCallerId(call: ts.CallExpression): DeclarationId | undefined {
    let current: ts.Node | undefined = call.parent;

    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        const direct = idForAnchor(current);

        if (direct !== undefined) {
          return direct;
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
          const direct = idForAnchor(current);

          if (direct !== undefined) {
            return direct;
          }
        }
      } else if (
        ts.isVariableDeclaration(current) &&
        current.name &&
        ts.isIdentifier(current.name) &&
        current.initializer
      ) {
        const direct = idForAnchor(current);

        if (direct !== undefined) {
          return direct;
        }
      } else if (
        ts.isPropertyDeclaration(current) &&
        current.name &&
        (ts.isIdentifier(current.name) ||
          ts.isStringLiteral(current.name) ||
          ts.isNumericLiteral(current.name) ||
          ts.isComputedPropertyName(current.name)) &&
        current.initializer
      ) {
        const direct = idForAnchor(current);

        if (direct !== undefined) {
          return direct;
        }
      } else if (
        ts.isPropertyAssignment(current) &&
        (ts.isIdentifier(current.name) ||
          ts.isStringLiteral(current.name) ||
          ts.isNumericLiteral(current.name) ||
          ts.isComputedPropertyName(current.name)) &&
        current.initializer
      ) {
        const direct = idForAnchor(current);

        if (direct !== undefined) {
          return direct;
        }

        const symbol = getPropertyAssignmentCalleeSymbol(current);

        if (symbol) {
          const candidates = idsForSymbol(symbol);

          if (candidates.length === 1) {
            return candidates[0];
          }
        }
      }

      current = current.parent;
    }

    return undefined;
  }

  const edges: V1CallEdge[] = [];
  const seenEdges = new Set<string>();

  function emitEdge(
    callerId: DeclarationId,
    calleeId: DeclarationId,
    file: CanonicalPath,
    line: number,
  ): void {
    const key = `${callerId}\0${calleeId}\0${file}\0${line}`;

    if (seenEdges.has(key)) {
      return;
    }

    seenEdges.add(key);
    edges.push({ callerId, calleeId, callSite: { file, line } });
  }

  for (const [canonicalPath, sourceFile] of sourceFiles) {
    function visit(node: ts.Node): void {
      // NewExpression is intentionally not visited: constructors are
      // not V1 call-graph nodes (legacy parity).
      if (!ts.isCallExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      const calleeExpression = unwrapExpression(node.expression);

      if (
        !ts.isIdentifier(calleeExpression) &&
        !ts.isPropertyAccessExpression(calleeExpression) &&
        !ts.isElementAccessExpression(calleeExpression)
      ) {
        ts.forEachChild(node, visit);
        return;
      }

      const callerId = findCallerId(node);

      if (callerId === undefined) {
        ts.forEachChild(node, visit);
        return;
      }

      let calleeSymbol: ts.Symbol | undefined;

      if (ts.isElementAccessExpression(calleeExpression)) {
        let objectType: ts.Type | undefined;

        try {
          objectType = checker.getNonNullableType(
            checker.getTypeAtLocation(calleeExpression.expression),
          );
        } catch {
          objectType = undefined;
        }

        const rawArgument = calleeExpression.argumentExpression;
        const argument = rawArgument
          ? (unwrapExpression(rawArgument) as ts.Expression)
          : undefined;

        if (
          objectType &&
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
            let argumentType: ts.Type | undefined;

            try {
              argumentType = checker.getTypeAtLocation(argument);
            } catch {
              argumentType = undefined;
            }

            if (
              argumentType &&
              (argumentType.isStringLiteral() ||
                argumentType.isNumberLiteral())
            ) {
              propertyName = argumentType.value.toString();
            }
          }

          if (propertyName !== undefined) {
            try {
              calleeSymbol =
                checker.getPropertyOfType(objectType, propertyName) ??
                undefined;
            } catch {
              calleeSymbol = undefined;
            }
          }
        }
      } else {
        calleeSymbol = symbolAtLocation(calleeExpression);
      }

      if (calleeSymbol) {
        const calleeIds: DeclarationId[] = [];
        const seenCalleeIds = new Set<DeclarationId>();

        function addCalleeId(id: DeclarationId | undefined): void {
          if (id !== undefined && !seenCalleeIds.has(id)) {
            seenCalleeIds.add(id);
            calleeIds.push(id);
          }
        }

        addCalleeId(
          selectCalleeId(idsForSymbol(calleeSymbol), node),
        );

        if (
          ts.isPropertyAccessExpression(calleeExpression) ||
          ts.isElementAccessExpression(calleeExpression)
        ) {
          const receiverExpression = unwrapExpression(
            calleeExpression.expression,
          );

          const implementationSymbol = getInterfaceMethodImplementation(
            calleeSymbol,
            receiverExpression,
          );

          if (implementationSymbol) {
            addCalleeId(
              selectCalleeId(idsForSymbol(implementationSymbol), node),
            );
          }

          if (isPolymorphicReceiver(receiverExpression)) {
            const receiverType = getReceiverType(receiverExpression);

            if (receiverType) {
              const polymorphicSymbols = getPolymorphicMethodImplementations(
                resolveSymbol(calleeSymbol).getName(),
                receiverType,
              );

              for (const polymorphicSymbol of polymorphicSymbols) {
                addCalleeId(
                  selectCalleeId(idsForSymbol(polymorphicSymbol), node),
                );
              }
            }
          }
        }

        if (calleeIds.length > 0) {
          let line: number;

          try {
            line =
              sourceFile.getLineAndCharacterOfPosition(
                calleeExpression.getStart(sourceFile),
              ).line + 1;
          } catch {
            ts.forEachChild(node, visit);
            return;
          }

          for (const calleeId of calleeIds) {
            emitEdge(callerId, calleeId, canonicalPath, line);
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  edges.sort(compareV1CallEdges);

  return { edges };
}
