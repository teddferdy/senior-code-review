import ts from "typescript";
import { posix } from "node:path";

/*
 * Source-backed Analysis Context V1 — identity primitives.
 *
 * This module owns:
 *  - CanonicalPath + normalization (single path policy for V1)
 *  - DeclarationId / SymbolId formats
 *  - DeclarationRecord / SymbolRecord / AliasRecord models
 *  - Deterministic declaration/symbol table construction from a ts.Program
 *  - Best-match correlation helper shared by AnalysisContext and the
 *    call-graph sidecar adapter.
 *
 * It does NOT own ts.Program construction (see analysis-context.ts) and
 * does NOT change any legacy analyzer.
 */

/** Repository-relative POSIX path. The canonical identity for sources. */
export type CanonicalPath = string;

export type DeclarationId = string;
export type SymbolId = string;

export type DeclarationKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "property"
  | "variable"
  | "overload"
  | "objectMethod";

export interface DeclarationRecord {
  id: DeclarationId;
  symbolId: SymbolId;
  kind: DeclarationKind;
  name: string;
  file: CanonicalPath;
  startOffset: number;
  endOffset: number;
  /** 1-based line of the binding NAME (matches legacy CallGraphNode.line). */
  line: number;
  /** 1-based lines of the full binding span (for containment matching). */
  spanStartLine: number;
  spanEndLine: number;
  parentId: DeclarationId | null;
  qualifiedName: string;
  exported: boolean;
  overloadIndex: number;
  overloads?: readonly DeclarationId[];
}

export interface AliasRecord {
  fromFile: CanonicalPath;
  exportedName: string;
  localName: string | undefined;
  targetSymbolId: SymbolId | undefined;
  via: "export-from" | "export-star" | "re-export-namespace";
}

export interface SymbolRecord {
  id: SymbolId;
  primaryDeclarationId: DeclarationId;
  declarations: readonly DeclarationId[];
  aliases: readonly AliasRecord[];
}

export interface DeclarationTables {
  declarations: ReadonlyMap<DeclarationId, DeclarationRecord>;
  symbols: ReadonlyMap<SymbolId, SymbolRecord>;
  aliases: readonly AliasRecord[];
  byFile: ReadonlyMap<CanonicalPath, readonly DeclarationId[]>;
}

export interface TableBuildEntry {
  canonicalPath: CanonicalPath;
  sourceFile: ts.SourceFile;
}

const SUPPORTED_PROGRAM_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
]);

/**
 * Canonical path normalization (locked V1 policy):
 * 1. Replace \ with /
 * 2. Collapse repeated /
 * 3. Strip leading ./ segments and leading /
 * 4. posix.normalize
 * 5. Reject empty
 * 6. Reject paths escaping the repository root (leading ..)
 * 7. Preserve case
 * 8. Never resolve symlinks (no fs access here by construction)
 * 9. Never emit Windows separators
 */
export function normalizeCanonicalPath(input: string): CanonicalPath | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  let p = input.replace(/\\/g, "/");
  p = p.replace(/\/+/g, "/");

  let stripped = p;

  // Strip leading ./ segments and leading / characters iteratively so
  // inputs like "/./a", "././a", "//a" all converge.
  for (;;) {
    if (stripped.startsWith("./")) {
      stripped = stripped.slice(2);
      continue;
    }

    if (stripped.startsWith("/")) {
      stripped = stripped.slice(1);
      continue;
    }

    break;
  }

  if (stripped === "" || stripped === ".") {
    return undefined;
  }

  // Reject Windows drive-absolute inputs (e.g. C:/repo/a.ts): these are
  // outside-root by construction and must surface as external.
  if (/^[A-Za-z]:\//.test(stripped)) {
    return undefined;
  }

  const normalized = posix.normalize(stripped);

  if (normalized === "" || normalized === ".") {
    return undefined;
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }

  // posix.normalize never emits backslashes; guard anyway.
  if (normalized.includes("\\")) {
    return undefined;
  }

  return normalized;
}

/** Case-insensitive program-root check for .ts/.tsx/.js/.jsx. */
export function isSupportedProgramPath(canonicalPath: CanonicalPath): boolean {
  const lower = canonicalPath.toLowerCase();
  const dot = lower.lastIndexOf(".");

  if (dot === -1) {
    return false;
  }

  return SUPPORTED_PROGRAM_EXTENSIONS.has(lower.slice(dot));
}

export function formatDeclarationId(
  canonicalPath: CanonicalPath,
  startOffset: number,
  endOffset: number,
  kind: DeclarationKind,
  qualifiedName: string,
  overloadIndex: number,
): DeclarationId {
  return `decl:${canonicalPath}:${startOffset}-${endOffset}:${kind}:${qualifiedName}#${overloadIndex}`;
}

export function formatSymbolId(
  primaryCanonicalPath: CanonicalPath,
  qualifiedName: string,
  symbolName: string,
): SymbolId {
  return `sym:${primaryCanonicalPath}:${qualifiedName}:${symbolName}`;
}

/** Resolve the statically-known name of a class/object member, if any. */
function getStaticMemberName(
  name: ts.PropertyName | undefined,
  checker: ts.TypeChecker,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }

  if (ts.isIdentifier(name)) {
    return name.text;
  }

  if (
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    let expression = name.expression;

    // Unwrap parenthesized / assertion / non-null wrappers around the key,
    // mirroring the call-graph wrapper policy (locked, not expanded).
    while (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression) ||
      ts.isNonNullExpression(expression)
    ) {
      expression = expression.expression;
    }

    if (
      ts.isStringLiteral(expression) ||
      ts.isNumericLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }

    try {
      const literalType = checker.getTypeAtLocation(expression);

      if (
        literalType.isStringLiteral() ||
        literalType.isNumberLiteral()
      ) {
        return literalType.value.toString();
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  return undefined;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = (node as { modifiers?: readonly ts.Modifier[] }).modifiers;

  return (
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) ?? false
  );
}

function isFunctionLikeInitializer(
  initializer: ts.Expression | undefined,
): boolean {
  if (!initializer) {
    return false;
  }

  let current: ts.Expression = initializer;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return ts.isArrowFunction(current) || ts.isFunctionExpression(current);
}

interface ProvisionalDeclaration {
  index: number;
  file: CanonicalPath;
  sourceFile: ts.SourceFile;
  bindingNode: ts.Node;
  nameNode: ts.Node;
  kind: DeclarationKind;
  name: string;
  qualifiedName: string;
  startOffset: number;
  endOffset: number;
  nameLine: number;
  spanStartLine: number;
  spanEndLine: number;
  exported: boolean;
  parentIndex: number | null;
}

function resolveProvisionalSymbol(
  prov: ProvisionalDeclaration,
  checker: ts.TypeChecker,
): ts.Symbol | undefined {
  try {
    const symbol = checker.getSymbolAtLocation(prov.nameNode);

    if (!symbol) {
      return undefined;
    }

    if (symbol.flags & ts.SymbolFlags.Alias) {
      try {
        return checker.getAliasedSymbol(symbol);
      } catch {
        return symbol;
      }
    }

    return symbol;
  } catch {
    return undefined;
  }
}

export function buildDeclarationTables(
  checker: ts.TypeChecker,
  entries: readonly TableBuildEntry[],
): DeclarationTables {
  const sortedEntries = [...entries].sort((a, b) =>
    a.canonicalPath < b.canonicalPath
      ? -1
      : a.canonicalPath > b.canonicalPath
        ? 1
        : 0,
  );

  const provisional: ProvisionalDeclaration[] = [];

  function addProvisional(
    file: CanonicalPath,
    sourceFile: ts.SourceFile,
    bindingNode: ts.Node,
    nameNode: ts.Node,
    kind: DeclarationKind,
    name: string,
    scopeNames: readonly string[],
    exported: boolean,
    parentStack: readonly number[],
  ): void {
    let startOffset: number;
    let endOffset: number;

    try {
      startOffset = bindingNode.getStart(sourceFile);
      endOffset = bindingNode.getEnd();
    } catch {
      return;
    }

    if (startOffset < 0 || endOffset <= startOffset) {
      return;
    }

    let nameOffset: number;

    try {
      nameOffset = nameNode.getStart(sourceFile);
    } catch {
      return;
    }

    const qualifiedName = [...scopeNames, name].join(".");
    const nameLine =
      sourceFile.getLineAndCharacterOfPosition(nameOffset).line + 1;
    const spanStartLine =
      sourceFile.getLineAndCharacterOfPosition(startOffset).line + 1;
    const spanEndLine =
      sourceFile.getLineAndCharacterOfPosition(Math.max(startOffset, endOffset - 1))
        .line + 1;

    provisional.push({
      index: provisional.length,
      file,
      sourceFile,
      bindingNode,
      nameNode,
      kind,
      name,
      qualifiedName,
      startOffset,
      endOffset,
      nameLine,
      spanStartLine,
      spanEndLine,
      exported,
      parentIndex:
        parentStack.length > 0 ? parentStack[parentStack.length - 1] : null,
    });
  }

  for (const entry of sortedEntries) {
    const { canonicalPath: file, sourceFile } = entry;

    function visit(
      node: ts.Node,
      scopeNames: readonly string[],
      parentStack: readonly number[],
    ): void {
      // Named function declarations (including overload signatures).
      if (ts.isFunctionDeclaration(node) && node.name) {
        const kind: DeclarationKind = node.body ? "function" : "overload";

        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          kind,
          node.name.text,
          scopeNames,
          hasExportModifier(node),
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, node.name.text];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      if (ts.isClassDeclaration(node) && node.name) {
        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          "class",
          node.name.text,
          scopeNames,
          hasExportModifier(node),
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, node.name.text];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      if (ts.isInterfaceDeclaration(node) && node.name) {
        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          "interface",
          node.name.text,
          scopeNames,
          hasExportModifier(node),
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, node.name.text];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        node.parent &&
        !(
          ts.isIdentifier(node.name) &&
          node.name.text === "constructor"
        )
      ) {
        // Accessors are explicitly out of V1 identity scope.
        if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        const inObjectLiteral = ts.isObjectLiteralExpression(node.parent);
        const memberName = getStaticMemberName(node.name, checker);

        // Dynamically-keyed methods (__computed) get no ID.
        if (memberName === undefined) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        const kind: DeclarationKind = node.body
          ? inObjectLiteral
            ? "objectMethod"
            : "method"
          : "overload";

        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          kind,
          memberName,
          scopeNames,
          false,
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, memberName];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      // Constructors: no ID, but nested declarations keep outer parent.
      if (ts.isConstructorDeclaration(node)) {
        ts.forEachChild(node, (child) =>
          visit(child, scopeNames, parentStack),
        );

        return;
      }

      if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
        ts.forEachChild(node, (child) =>
          visit(child, scopeNames, parentStack),
        );

        return;
      }

      if (
        ts.isPropertyDeclaration(node) &&
        node.name
      ) {
        if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        const memberName = getStaticMemberName(node.name, checker);

        if (memberName === undefined) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          "property",
          memberName,
          scopeNames,
          hasExportModifier(node),
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, memberName];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const variableName = node.name.text;

        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          "variable",
          variableName,
          scopeNames,
          false,
          parentStack,
        );

        const selfIndex = provisional.length - 1;

        // Object-literal members inherit the variable scope
        // (e.g. service.run for `const service = { run() {} }`).
        if (
          node.initializer &&
          ts.isObjectLiteralExpression(node.initializer)
        ) {
          const childScope = [...scopeNames, variableName];

          ts.forEachChild(node, (child) =>
            visit(child, childScope, [...parentStack, selfIndex]),
          );

          return;
        }

        const childScope = [...scopeNames, variableName];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      if (ts.isPropertyAssignment(node)) {
        const memberName = getStaticMemberName(node.name, checker);

        if (memberName === undefined) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        // Only function-valued object properties are indexed in V1,
        // mirroring the call-graph indexed set.
        if (!isFunctionLikeInitializer(node.initializer)) {
          ts.forEachChild(node, (child) =>
            visit(child, scopeNames, parentStack),
          );

          return;
        }

        addProvisional(
          file,
          sourceFile,
          node,
          node.name,
          "objectMethod",
          memberName,
          scopeNames,
          false,
          parentStack,
        );

        const selfIndex = provisional.length - 1;
        const childScope = [...scopeNames, memberName];

        ts.forEachChild(node, (child) =>
          visit(child, childScope, [...parentStack, selfIndex]),
        );

        return;
      }

      ts.forEachChild(node, (child) =>
        visit(child, scopeNames, parentStack),
      );
    }

    visit(sourceFile, [], []);
  }

  // Group provisional declarations by alias-resolved ts.Symbol.
  const groups = new Map<ts.Symbol, number[]>();
  const ungrouped: number[] = [];

  for (const prov of provisional) {
    const symbol = resolveProvisionalSymbol(prov, checker);

    if (!symbol) {
      ungrouped.push(prov.index);
      continue;
    }

    const existing = groups.get(symbol);

    if (existing) {
      existing.push(prov.index);
    } else {
      groups.set(symbol, [prov.index]);
    }
  }

  for (const alone of ungrouped) {
    // Synthetic singleton group keyed by a fresh object identity is
    // unnecessary: handle singletons directly during finalization.
    void alone;
  }

  interface FinalGroup {
    memberIndices: number[];
    symbol: ts.Symbol | undefined;
  }

  const finalGroups: FinalGroup[] = [];

  for (const [symbol, memberIndices] of groups) {
    finalGroups.push({ memberIndices, symbol });
  }

  for (const alone of ungrouped) {
    finalGroups.push({ memberIndices: [alone], symbol: undefined });
  }

  // Deterministic group order: sort by first member's
  // (file, startOffset, qualifiedName).
  finalGroups.sort((a, b) => {
    const pa = provisional[a.memberIndices[0]];
    const pb = provisional[b.memberIndices[0]];

    if (pa.file !== pb.file) {
      return pa.file < pb.file ? -1 : 1;
    }

    if (pa.startOffset !== pb.startOffset) {
      return pa.startOffset - pb.startOffset;
    }

    return pa.qualifiedName < pb.qualifiedName
      ? -1
      : pa.qualifiedName > pb.qualifiedName
        ? 1
        : 0;
  });

  const finalIds = new Array<string>(provisional.length);
  const finalSymbolIds = new Array<string>(provisional.length);

  // Assign overload indices (span-ordered) and compute IDs.
  for (const group of finalGroups) {
    const ordered = [...group.memberIndices].sort((ia, ib) => {
      const pa = provisional[ia];
      const pb = provisional[ib];

      if (pa.startOffset !== pb.startOffset) {
        return pa.startOffset - pb.startOffset;
      }

      if (pa.endOffset !== pb.endOffset) {
        return pa.endOffset - pb.endOffset;
      }

      if (pa.file !== pb.file) {
        return pa.file < pb.file ? -1 : 1;
      }

      return pa.qualifiedName < pb.qualifiedName
        ? -1
        : pa.qualifiedName > pb.qualifiedName
          ? 1
          : 0;
    });

    const primary = provisional[ordered[0]];
    let symbolName: string;

    try {
      symbolName = group.symbol ? group.symbol.getName() : primary.name;
    } catch {
      symbolName = primary.name;
    }

    if (!symbolName) {
      symbolName = primary.name;
    }

    const symbolId = formatSymbolId(
      primary.file,
      primary.qualifiedName,
      symbolName,
    );

    ordered.forEach((provIndex, overloadIndex) => {
      const prov = provisional[provIndex];

      finalIds[provIndex] = formatDeclarationId(
        prov.file,
        prov.startOffset,
        prov.endOffset,
        prov.kind,
        prov.qualifiedName,
        overloadIndex,
      );
      finalSymbolIds[provIndex] = symbolId;
    });
  }

  const declarations = new Map<DeclarationId, DeclarationRecord>();
  const symbols = new Map<SymbolId, SymbolRecord>();
  const byFileMutable = new Map<CanonicalPath, DeclarationId[]>();
  const membersBySymbol = new Map<SymbolId, DeclarationId[]>();

  for (const prov of provisional) {
    const id = finalIds[prov.index] as DeclarationId;
    const symbolId = finalSymbolIds[prov.index] as SymbolId;

    const siblings = membersBySymbol.get(symbolId);

    if (siblings) {
      siblings.push(id);
    } else {
      membersBySymbol.set(symbolId, [id]);
    }

    const fileList = byFileMutable.get(prov.file);

    if (fileList) {
      fileList.push(id);
    } else {
      byFileMutable.set(prov.file, [id]);
    }
  }

  // Sort per-file lists and sibling lists deterministically (by ID string,
  // which embeds file + offsets, so this is span-ordered).
  for (const list of byFileMutable.values()) {
    list.sort();
  }

  for (const list of membersBySymbol.values()) {
    list.sort();
  }

  for (const prov of provisional) {
    const id = finalIds[prov.index] as DeclarationId;
    const symbolId = finalSymbolIds[prov.index] as SymbolId;
    const siblings = membersBySymbol.get(symbolId) ?? [id];

    declarations.set(id, {
      id,
      symbolId,
      kind: prov.kind,
      name: prov.name,
      file: prov.file,
      startOffset: prov.startOffset,
      endOffset: prov.endOffset,
      line: prov.nameLine,
      spanStartLine: prov.spanStartLine,
      spanEndLine: prov.spanEndLine,
      parentId:
        prov.parentIndex !== null
          ? (finalIds[prov.parentIndex] as DeclarationId)
          : null,
      qualifiedName: prov.qualifiedName,
      exported: prov.exported,
      overloadIndex: siblings.indexOf(id),
      ...(siblings.length > 1 ? { overloads: [...siblings] } : {}),
    });
  }

  const aliases = collectAliasRecords(
    checker,
    sortedEntries,
    symbolsByObject(groups, provisional, finalSymbolIds),
  );

  for (const [symbolId, memberIds] of membersBySymbol) {
    const primaryDeclarationId = [...memberIds].sort()[0];
    const relatedAliases = aliases.filter(
      (alias) => alias.targetSymbolId === symbolId,
    );

    symbols.set(symbolId, {
      id: symbolId,
      primaryDeclarationId,
      declarations: [...memberIds].sort(),
      aliases: relatedAliases,
    });
  }

  const byFile = new Map<CanonicalPath, readonly DeclarationId[]>();

  for (const [file, list] of byFileMutable) {
    byFile.set(file, [...list]);
  }

  return { declarations, symbols, aliases, byFile };
}

function symbolsByObject(
  groups: Map<ts.Symbol, number[]>,
  provisional: ProvisionalDeclaration[],
  finalSymbolIds: string[],
): Map<ts.Symbol, SymbolId> {
  const map = new Map<ts.Symbol, SymbolId>();

  for (const [symbol, memberIndices] of groups) {
    const first = memberIndices[0];

    if (first !== undefined) {
      map.set(symbol, finalSymbolIds[provisional[first].index] as SymbolId);
    }
  }

  return map;
}

function collectAliasRecords(
  checker: ts.TypeChecker,
  entries: readonly TableBuildEntry[],
  symbolIdByObject: Map<ts.Symbol, SymbolId>,
): AliasRecord[] {
  const aliases: AliasRecord[] = [];

  function resolveToSymbolId(symbol: ts.Symbol | undefined): SymbolId | undefined {
    if (!symbol) {
      return undefined;
    }

    let resolved = symbol;

    if (resolved.flags & ts.SymbolFlags.Alias) {
      try {
        resolved = checker.getAliasedSymbol(resolved);
      } catch {
        return undefined;
      }
    }

    return symbolIdByObject.get(resolved);
  }

  for (const entry of entries) {
    const { canonicalPath: file, sourceFile } = entry;

    function visit(node: ts.Node): void {
      if (ts.isExportDeclaration(node)) {
        const specifierText = node.moduleSpecifier
          ? ts.isStringLiteral(node.moduleSpecifier) ||
            ts.isNoSubstitutionTemplateLiteral(node.moduleSpecifier)
            ? node.moduleSpecifier.text
            : undefined
          : undefined;

        if (node.moduleSpecifier && specifierText !== undefined) {
          if (
            node.exportClause &&
            ts.isNamedExports(node.exportClause)
          ) {
            for (const element of node.exportClause.elements) {
              const exportedName = element.name.text;
              const localName = element.propertyName?.text ?? element.name.text;
              let target: SymbolId | undefined;

              try {
                const exportSymbol = checker.getSymbolAtLocation(element.name);
                target = resolveToSymbolId(exportSymbol);
              } catch {
                target = undefined;
              }

              // Fallback: resolve via the propertyName when the exported
              // name lookup yields nothing (checker version variance).
              if (target === undefined && element.propertyName) {
                try {
                  const localSymbol = checker.getSymbolAtLocation(
                    element.propertyName,
                  );
                  target = resolveToSymbolId(localSymbol);
                } catch {
                  target = undefined;
                }
              }

              aliases.push({
                fromFile: file,
                exportedName,
                localName,
                targetSymbolId: target,
                via: "export-from",
              });
            }
          } else if (
            node.exportClause &&
            ts.isNamespaceExport(node.exportClause)
          ) {
            aliases.push({
              fromFile: file,
              exportedName: node.exportClause.name.text,
              localName: undefined,
              targetSymbolId: undefined,
              via: "re-export-namespace",
            });
          } else {
            // `export * from "…"`: member expansion is lazy/ambiguous by
            // design in V1; the module edge carries the relationship.
            aliases.push({
              fromFile: file,
              exportedName: "*",
              localName: undefined,
              targetSymbolId: undefined,
              via: "export-star",
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  aliases.sort((a, b) =>
    a.fromFile !== b.fromFile
      ? a.fromFile < b.fromFile
        ? -1
        : 1
      : a.exportedName !== b.exportedName
        ? a.exportedName < b.exportedName
          ? -1
          : 1
        : 0,
  );

  return aliases;
}

/**
 * Best-match correlation for a legacy (filePath, symbolName, line) node.
 * Rules (locked): same file, name match, name-line exact preferred with
 * span-containment fallback, smallest-span tie-break, ambiguity → undefined.
 */
export function findBestDeclarationMatch(
  candidatesInFile: readonly DeclarationRecord[],
  symbolName: string,
  line: number,
): DeclarationRecord | undefined {
  const named = candidatesInFile.filter(
    (record) => record.name === symbolName,
  );

  if (named.length === 0) {
    return undefined;
  }

  const exactLine = named.filter((record) => record.line === line);

  if (exactLine.length === 1) {
    return exactLine[0];
  }

  if (exactLine.length > 1) {
    return smallestSpanUnique(exactLine);
  }

  const containing = named.filter(
    (record) => record.spanStartLine <= line && line <= record.spanEndLine,
  );

  if (containing.length === 0) {
    return undefined;
  }

  if (containing.length === 1) {
    return containing[0];
  }

  return smallestSpanUnique(containing);
}

function smallestSpanUnique(
  records: readonly DeclarationRecord[],
): DeclarationRecord | undefined {
  let best: DeclarationRecord | undefined;
  let bestSpan = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const record of records) {
    const span = record.endOffset - record.startOffset;

    if (span < bestSpan) {
      best = record;
      bestSpan = span;
      tied = false;
    } else if (span === bestSpan) {
      tied = true;
    }
  }

  if (tied || !best) {
    return undefined;
  }

  return best;
}
