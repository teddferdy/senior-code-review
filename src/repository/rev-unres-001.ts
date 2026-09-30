import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-UNRES-001 — Unresolved Relative Import Review.
 *
 * Policy predicate over existing ModuleEdge facts: a source module must
 * not contain a relative import/export specifier that does not resolve
 * to a supplied canonical source.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO
 *   EVALUATION, which is neither pass nor fail. The rule is never
 *   universal.
 * - violation iff `edge.kind === "unresolved"`. The classification is
 *   consumed, never recomputed: no `resolveImport()` call, no
 *   filesystem check, no package.json, no node_modules, no tsconfig
 *   `paths`/`baseUrl`, no second resolver, no legacy import-map.
 *   Because `classifyKind` returns "unresolved" before it consults the
 *   type-only marking and `ModuleEdge` carries no type-only flag, a
 *   type-only unresolved statement is reported exactly like a runtime
 *   one; the rule makes no runtime/type-only claim.
 * - supplied-universe semantics: "unresolved" means unresolvable within
 *   the canonical source set handed to the AnalysisContext. A target
 *   that exists in the repository but was not supplied is still
 *   reported. Completeness is never assumed, discovered, or checked.
 * - every supported `via` participates (import, export-from,
 *   export-star, re-export-namespace); `kind` is the only gate.
 * - external and resolved edges are ignored. A self-import resolves to
 *   itself and is therefore `runtime`, never reported, and is not
 *   special-cased. No path filtering of any kind: tests, fixtures,
 *   generated-looking, nested-package, and monorepo-like paths all
 *   participate exactly as supplied.
 * - duplicates are preserved: exactly one violation per ModuleEdge, so
 *   two identical import statements remain two violations. Occurrences
 *   are distinguished by their imported names, not collapsed.
 * - readonly: edges and context-owned arrays are never mutated; the
 *   only copy taken is `importedNames`, which is a context-owned array.
 *   No location, line, column, offset, target, severity, confidence,
 *   message, or remediation is ever produced or implied.
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (source, rawSpecifier, via, kind, importedNames). No I/O,
 *   no object identity, no timestamps, no randomness.
 * - unsupported by construction: dynamic `import()`, `require()`,
 *   computed `require()`, and runtime module loading emit no
 *   ModuleEdge at all, so they are unobservable here and unreported.
 */

export interface RevUnres001Violation {
  readonly source: CanonicalPath;
  readonly rawSpecifier: string;
  readonly kind: "unresolved";
  readonly via: ModuleEdge["via"];
  readonly importedNames: readonly string[] | undefined;
}

/*
 * Minimum applicability boundary for the locked SPECIFIC-TARGET
 * policy. This is not a generic policy/config framework: it is a
 * single explicit declaration, owned by the caller, that REV-UNRES-001
 * governs the reviewed project. Anything other than an explicit
 * `applicable: true` means the rule is not evaluated.
 */
export interface RevUnres001Options {
  readonly applicable?: boolean;
}

export type RevUnres001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | { readonly evaluated: true; readonly violations: RevUnres001Violation[] };

function compareImportedNames(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  const leftNames = left ?? [];
  const rightNames = right ?? [];
  const shared = Math.min(leftNames.length, rightNames.length);

  for (let index = 0; index < shared; index += 1) {
    const a = leftNames[index] as string;
    const b = rightNames[index] as string;

    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }

  if (leftNames.length !== rightNames.length) {
    return leftNames.length < rightNames.length ? -1 : 1;
  }

  return 0;
}

function compareViolations(
  left: RevUnres001Violation,
  right: RevUnres001Violation,
): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
  }

  if (left.rawSpecifier !== right.rawSpecifier) {
    return left.rawSpecifier < right.rawSpecifier ? -1 : 1;
  }

  if (left.via !== right.via) {
    return left.via < right.via ? -1 : 1;
  }

  if (left.kind !== right.kind) {
    return left.kind < right.kind ? -1 : 1;
  }

  return compareImportedNames(left.importedNames, right.importedNames);
}

/**
 * Whether a module edge violates REV-UNRES-001. Consumes the upstream
 * classification only; no resolution is performed.
 */
export function isRevUnres001Violation(edge: ModuleEdge): boolean {
  return edge.kind === "unresolved";
}

export function evaluateRevUnres001(
  context: AnalysisContext,
  options?: RevUnres001Options,
): RevUnres001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevUnres001Violation[] = [];

  for (const edge of context.allModuleEdges()) {
    if (!isRevUnres001Violation(edge)) {
      continue;
    }

    violations.push({
      source: edge.from,
      rawSpecifier: edge.rawSpecifier,
      kind: "unresolved",
      via: edge.via,
      importedNames: edge.importedNames ? [...edge.importedNames] : undefined,
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
