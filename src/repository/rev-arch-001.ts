import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-ARCH-001 — Architectural Dependency Boundary Review.
 *
 * Policy predicate over existing ModuleEdge facts: a source module
 * under root-anchored `src/repository/**` must not have a resolved
 * source-level module dependency on root-anchored `src/ui/**`.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false means NO EVALUATION, which
 *   is neither pass nor fail. The rule is never universal.
 * - violation iff `e.to !== null` AND `e.kind` is runtime/type-only
 *   AND `e.from` is under `src/repository/**` AND `e.to` is under
 *   `src/ui/**`. No other condition, no other boundary.
 * - path matching is segment-based over canonical paths, so
 *   `src/repository-extra/`, `src/ui-kit/`, `src/uikit/` never match
 *   and nested `packages/foo/src/...` scopes are out of scope.
 * - direct edges only: no traversal, no closure, no inference.
 * - readonly: input edges are never mutated; violation records carry
 *   only source-derived evidence (`rawSpecifier`, `via`, `kind`).
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (source, target, rawSpecifier, via, kind).
 */

export const REV_ARCH_001_BOUNDARY =
  "REV-ARCH-001: src/repository/** -> src/ui/**" as const;

export interface RevArch001Evidence {
  rawSpecifier: string;
  via: ModuleEdge["via"];
  kind: ModuleEdge["kind"];
}

export interface RevArch001Violation {
  source: CanonicalPath;
  target: CanonicalPath;
  boundary: typeof REV_ARCH_001_BOUNDARY;
  evidence: RevArch001Evidence;
}

/*
 * Minimum applicability boundary for the locked SPECIFIC-TARGET
 * policy. This is not a generic policy/config framework: it is a
 * single explicit declaration, owned by the caller, that REV-ARCH-001
 * governs the reviewed project. Anything other than an explicit
 * `applicable: true` means the rule is not evaluated.
 */
export interface RevArch001Options {
  applicable?: boolean;
}

export type RevArch001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | { readonly evaluated: true; readonly violations: RevArch001Violation[] };

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderSrcRepository(canonicalPath: CanonicalPath): boolean {
  const segments = pathSegments(canonicalPath);

  return segments[0] === "src" && segments[1] === "repository";
}

function isUnderSrcUi(canonicalPath: CanonicalPath): boolean {
  const segments = pathSegments(canonicalPath);

  return segments[0] === "src" && segments[1] === "ui";
}

export function isRevArch001Violation(edge: ModuleEdge): boolean {
  if (edge.to === null) {
    return false;
  }

  if (edge.kind !== "runtime" && edge.kind !== "type-only") {
    return false;
  }

  if (!isUnderSrcRepository(edge.from)) {
    return false;
  }

  if (!isUnderSrcUi(edge.to)) {
    return false;
  }

  return true;
}

function compareViolations(
  left: RevArch001Violation,
  right: RevArch001Violation,
): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
  }

  if (left.target !== right.target) {
    return left.target < right.target ? -1 : 1;
  }

  if (left.evidence.rawSpecifier !== right.evidence.rawSpecifier) {
    return left.evidence.rawSpecifier < right.evidence.rawSpecifier ? -1 : 1;
  }

  if (left.evidence.via !== right.evidence.via) {
    return left.evidence.via < right.evidence.via ? -1 : 1;
  }

  if (left.evidence.kind !== right.evidence.kind) {
    return left.evidence.kind < right.evidence.kind ? -1 : 1;
  }

  return 0;
}

export function evaluateRevArch001(
  context: AnalysisContext,
  options?: RevArch001Options,
): RevArch001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevArch001Violation[] = [];

  for (const edge of context.allModuleEdges()) {
    if (!isRevArch001Violation(edge)) {
      continue;
    }

    violations.push({
      source: edge.from,
      target: edge.to as CanonicalPath,
      boundary: REV_ARCH_001_BOUNDARY,
      evidence: {
        rawSpecifier: edge.rawSpecifier,
        via: edge.via,
        kind: edge.kind,
      },
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
