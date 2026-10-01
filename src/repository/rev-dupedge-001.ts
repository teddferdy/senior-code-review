import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-DUPEDGE-001 — Duplicate Module-Edge Review.
 *
 * Structural fact predicate over existing ModuleEdge facts: a module-edge
 * occurrence repeats an earlier occurrence in the context's module-edge
 * table.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the caller
 *   passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - duplication iff two occurrences have exactly equal `from`, `to`,
 *   `rawSpecifier`, `kind`, `via`, and `importedNames`. That is the
 *   complete predicate.
 * - the supplied endpoint and statement fields are consumed as represented.
 *   The rule performs no resolution, normalization, case folding,
 *   extension substitution, symlink handling, AST inspection, TypeChecker
 *   query, filesystem check, or raw-specifier inference.
 * - `to === null` equals only `to === null`. A resolved target equals only
 *   the identical canonical-target string.
 * - different `via` values are different facts, including when endpoints
 *   match. No topology-only deduplication is performed.
 * - all four represented kinds participate: `runtime`, `type-only`,
 *   `unresolved`, and `external`.
 * - imported names use exact sequence equality. `undefined` is distinct
 *   from `[]`; order is significant; no sorting, deduplication, folding,
 *   or normalization is applied.
 * - one violation is emitted for each occurrence after the first identical
 *   occurrence. Duplicate evidence therefore remains distinguishable by
 *   context-table occurrence order.
 * - evidence contains exactly six represented fields. `target` is included
 *   because it distinguishes resolved endpoints from `null`; `importedNames`
 *   is always explicitly present. No occurrence index, count, group ID,
 *   location, severity, confidence, message, or remediation is produced.
 * - readonly: `allModuleEdges()` may return shared edge and name-array
 *   references, so nothing context-owned is written. Every violation is
 *   newly allocated and every array-valued `importedNames` value is copied.
 * - deterministic: the output depends only on context facts and
 *   applicability, using UTF-16 code-unit ordering and stable sorting.
 */

export interface RevDupedge001Violation {
  readonly source: CanonicalPath;
  readonly target: CanonicalPath | null;
  readonly rawSpecifier: string;
  readonly kind: ModuleEdge["kind"];
  readonly via: ModuleEdge["via"];
  readonly importedNames: readonly string[] | undefined;
}

export interface RevDupedge001Options {
  readonly applicable?: boolean;
}

export type RevDupedge001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevDupedge001Violation[];
    };

function areImportedNamesIdentical(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === undefined && right === undefined;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areModuleEdgesIdentical(
  left: ModuleEdge,
  right: ModuleEdge,
): boolean {
  return (
    left.from === right.from &&
    left.to === right.to &&
    left.rawSpecifier === right.rawSpecifier &&
    left.kind === right.kind &&
    left.via === right.via &&
    areImportedNamesIdentical(left.importedNames, right.importedNames)
  );
}

function compareTargets(
  left: CanonicalPath | null,
  right: CanonicalPath | null,
): number {
  if (left === null || right === null) {
    if (left === right) {
      return 0;
    }

    return left === null ? -1 : 1;
  }

  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

function compareImportedNames(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  if (left === undefined || right === undefined) {
    if (left === right) {
      return 0;
    }

    return left === undefined ? -1 : 1;
  }

  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const leftName = left[index] as string;
    const rightName = right[index] as string;

    if (leftName !== rightName) {
      return leftName < rightName ? -1 : 1;
    }
  }

  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }

  return 0;
}

function compareViolations(
  left: RevDupedge001Violation,
  right: RevDupedge001Violation,
): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
  }

  const targetOrder = compareTargets(left.target, right.target);

  if (targetOrder !== 0) {
    return targetOrder;
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
 * Whether a module-edge occurrence repeats at least one strictly earlier
 * occurrence supplied in `previousEdges`.
 */
export function isRevDupedge001Duplicate(
  edge: ModuleEdge,
  previousEdges: readonly ModuleEdge[],
): boolean {
  return previousEdges.some((previous) =>
    areModuleEdgesIdentical(previous, edge),
  );
}

export function evaluateRevDupedge001(
  context: AnalysisContext,
  options?: RevDupedge001Options,
): RevDupedge001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevDupedge001Violation[] = [];
  const previousEdges: ModuleEdge[] = [];

  for (const edge of context.allModuleEdges()) {
    if (isRevDupedge001Duplicate(edge, previousEdges)) {
      violations.push({
        source: edge.from,
        target: edge.to,
        rawSpecifier: edge.rawSpecifier,
        kind: edge.kind,
        via: edge.via,
        importedNames: edge.importedNames ? [...edge.importedNames] : undefined,
      });
    }

    previousEdges.push(edge);
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
