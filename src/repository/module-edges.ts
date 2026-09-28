import ts from "typescript";

import type { CanonicalPath } from "./declaration-ids.js";
import { resolveImport } from "./import-resolver.js";

/*
 * Source-backed Analysis Context V1 — module relationships.
 *
 * New V1 source-of-truth for source-level module edges, covering the
 * locked supported syntax set. Legacy buildDependencyGraph output is
 * intentionally NOT reproduced or altered here.
 */

export type ModuleEdgeKind = "runtime" | "type-only" | "unresolved" | "external";

export type ModuleEdgeVia =
  | "import"
  | "export-from"
  | "export-star"
  | "re-export-namespace";

export interface ModuleEdge {
  from: CanonicalPath;
  to: CanonicalPath | null;
  rawSpecifier: string;
  kind: ModuleEdgeKind;
  via: ModuleEdgeVia;
  importedNames?: readonly string[];
}

export interface ModuleEdgeBuildInput {
  entries: readonly {
    canonicalPath: CanonicalPath;
    sourceFile: ts.SourceFile;
  }[];
  allCanonicalPaths: readonly CanonicalPath[];
}

function isTypeOnlyNode(node: ts.Node): boolean {
  return (
    (node as { isTypeOnly?: boolean }).isTypeOnly === true
  );
}

function extractSpecifierText(
  moduleSpecifier: ts.Expression,
): string | undefined {
  if (
    ts.isStringLiteral(moduleSpecifier) ||
    ts.isNoSubstitutionTemplateLiteral(moduleSpecifier)
  ) {
    return moduleSpecifier.text;
  }

  return undefined;
}

function resolveTarget(
  from: CanonicalPath,
  rawSpecifier: string,
  allCanonicalPaths: readonly CanonicalPath[],
): CanonicalPath | null {
  if (!rawSpecifier.startsWith(".")) {
    return null;
  }

  const resolved = resolveImport(from, rawSpecifier, [
    ...allCanonicalPaths,
  ]);

  return (resolved as CanonicalPath | undefined) ?? null;
}

function classifyKind(
  rawSpecifier: string,
  resolved: CanonicalPath | null,
  typeOnly: boolean,
): ModuleEdgeKind {
  // Resolution status dominates: non-relative specifiers are external and
  // unresolvable relative specifiers are unresolved, regardless of
  // type-only marking. Resolved edges then split runtime vs type-only.
  if (!rawSpecifier.startsWith(".")) {
    return "external";
  }

  if (resolved === null) {
    return "unresolved";
  }

  return typeOnly ? "type-only" : "runtime";
}

export function extractModuleEdges(
  input: ModuleEdgeBuildInput,
): ModuleEdge[] {
  const edges: ModuleEdge[] = [];
  const sortedEntries = [...input.entries].sort((a, b) =>
    a.canonicalPath < b.canonicalPath
      ? -1
      : a.canonicalPath > b.canonicalPath
        ? 1
        : 0,
  );

  for (const entry of sortedEntries) {
    const { canonicalPath: from, sourceFile } = entry;

    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) {
        const specifierText = extractSpecifierText(node.moduleSpecifier);

        if (specifierText !== undefined) {
          const clause = node.importClause;
          let importedNames: readonly string[] | undefined;
          let typeOnly =
            isTypeOnlyNode(node) || (clause ? isTypeOnlyNode(clause) : false);

          if (!clause) {
            importedNames = [];
          } else if (clause.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings)) {
              importedNames = [];
            } else {
              const elements = clause.namedBindings.elements;
              importedNames = elements.map(
                (element) =>
                  element.propertyName?.text ?? element.name.text,
              );

              if (
                elements.length > 0 &&
                elements.every((element) => isTypeOnlyNode(element))
              ) {
                typeOnly = true;
              } else if (
                elements.some((element) => !isTypeOnlyNode(element))
              ) {
                // Mixed `import { type A, b }` carries a runtime binding.
                if (!isTypeOnlyNode(node) && !isTypeOnlyNode(clause)) {
                  typeOnly = false;
                }
              }
            }
          } else if (clause.name) {
            importedNames = ["default"];
          } else {
            importedNames = [];
          }

          const resolved = resolveTarget(
            from,
            specifierText,
            input.allCanonicalPaths,
          );

          edges.push({
            from,
            to: resolved,
            rawSpecifier: specifierText,
            kind: classifyKind(specifierText, resolved, typeOnly),
            via: "import",
            importedNames,
          });
        }

        ts.forEachChild(node, visit);

        return;
      }

      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const specifierText = extractSpecifierText(node.moduleSpecifier);

        if (specifierText !== undefined) {
          const typeOnly = isTypeOnlyNode(node);

          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            const importedNames = node.exportClause.elements.map(
              (element) => element.name.text,
            );
            const resolved = resolveTarget(
              from,
              specifierText,
              input.allCanonicalPaths,
            );

            edges.push({
              from,
              to: resolved,
              rawSpecifier: specifierText,
              kind: classifyKind(specifierText, resolved, typeOnly),
              via: "export-from",
              importedNames,
            });
          } else if (
            node.exportClause &&
            ts.isNamespaceExport(node.exportClause)
          ) {
            const resolved = resolveTarget(
              from,
              specifierText,
              input.allCanonicalPaths,
            );

            edges.push({
              from,
              to: resolved,
              rawSpecifier: specifierText,
              kind: classifyKind(specifierText, resolved, typeOnly),
              via: "re-export-namespace",
              importedNames: [node.exportClause.name.text],
            });
          } else {
            const resolved = resolveTarget(
              from,
              specifierText,
              input.allCanonicalPaths,
            );

            edges.push({
              from,
              to: resolved,
              rawSpecifier: specifierText,
              kind: classifyKind(specifierText, resolved, typeOnly),
              via: "export-star",
            });
          }
        }

        ts.forEachChild(node, visit);

        return;
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return edges;
}
