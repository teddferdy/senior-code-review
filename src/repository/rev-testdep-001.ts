import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-TESTDEP-001 — Production-to-Test Dependency.
 *
 * Observed-graph fact over existing ModuleEdge facts: a resolved module
 * edge whose source is under `src/**` and whose target is under
 * `tests/**`.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - violation iff `edge.to !== null` AND `edge.kind` is `runtime` or
 *   `type-only` AND the first path segment of `edge.from` is exactly
 *   `src` AND the first path segment of `edge.to` is exactly `tests`.
 *   Segment equality (not prefix matching) keeps `src2/`, `my-src/`,
 *   `tests2/`, `my-tests/`, differing case, and root-level `src.ts` /
 *   `tests.ts` out of scope. The filename-based `file-classifier.ts`
 *   heuristic is never consulted.
 * - both resolved kinds qualify; `kind` is consumed from the module
 *   graph, never recomputed. `unresolved` and `external` edges have
 *   `to === null` and are excluded structurally.
 * - every represented resolved `via` participates (`import`,
 *   `export-from`, `export-star`, `re-export-namespace`); no syntax-form
 *   policy is applied. No `via` runtime check exists because the
 *   `ModuleEdge["via"]` union admits exactly these four values.
 * - direct edges only: each table edge is inspected independently. No
 *   BFS, no DFS, no traversal, no reachability, no alias resolution, no
 *   symbol/declaration/call-graph inspection, no synthesized transitive
 *   edges. A chain `src/a → src/b → tests/h` yields only the direct
 *   `src/b → tests/h` finding.
 * - one finding per qualifying `ModuleEdge` occurrence. Duplicates are
 *   preserved: two identical qualifying occurrences remain two findings
 *   with equal evidence. Duplicate-edge detection itself stays owned by
 *   REV-DUPEDGE-001; this rule performs no occurrence-window comparison.
 * - evidence echoes the represented edge (`from`, `to`, `rawSpecifier`,
 *   `kind`, `via`, `importedNames`) so occurrences differing only in
 *   specifier or imported names stay distinguishable. `to` is typed
 *   non-nullable because the predicate guarantees it. No message,
 *   severity, confidence, remediation, scope, or rule metadata is
 *   produced or implied.
 * - readonly: `allModuleEdges()` returns a fresh array of shared edge
 *   objects, so edges and `importedNames` arrays are never mutated;
 *   every violation and every array-valued `importedNames` value is
 *   newly allocated per evaluation. No caching, no global state, no
 *   filesystem reads, no compiler re-analysis.
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (`from`, `to`, `rawSpecifier`, `via`, `kind`,
 *   `importedNames`) using UTF-16 code-unit ordering — never
 *   `localeCompare`. Byte-identical occurrences retain stable table
 *   order.
 *
 * Known limitations (documented here, never in violation data):
 * - dynamic `import()`, `require()`, computed/non-literal specifiers,
 *   and bare/package/alias-style externals produce no qualifying edge
 *   and are therefore invisible here.
 * - files outside the supplied AnalysisContext universe are not
 *   represented; `package.json`, `tsconfig`, `node_modules`, and
 *   filesystem metadata are never consulted.
 * - a `runtime` edge does not imply runtime execution and a `type-only`
 *   edge does not imply a runtime dependency; the finding reports the
 *   represented dependency relationship only.
 * A finding therefore establishes only an observed resolved module edge
 * from a `src/**` module to a `tests/**` module in the supplied
 * analysis universe — never a runtime violation, a forbidden
 * dependency, or a guaranteed architectural defect.
 */

export interface RevTestdep001Violation {
  readonly from: CanonicalPath;
  readonly to: CanonicalPath;
  readonly rawSpecifier: string;
  readonly kind: "runtime" | "type-only";
  readonly via: ModuleEdge["via"];
  readonly importedNames: readonly string[] | undefined;
}

export interface RevTestdep001Options {
  readonly applicable?: boolean;
}

export type RevTestdep001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevTestdep001Violation[];
    };

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderSrc(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "src";
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "tests";
}

/**
 * Whether a module edge is a production-to-test dependency: a resolved
 * runtime or type-only edge from a `src/**` module to a `tests/**`
 * module. Stateless per-edge predicate; no occurrence window, no
 * traversal, no context access.
 */
export function isRevTestdep001Violation(
  edge: ModuleEdge,
): edge is ModuleEdge & {
  readonly to: CanonicalPath;
  readonly kind: "runtime" | "type-only";
} {
  if (edge.to === null) {
    return false;
  }

  if (edge.kind !== "runtime" && edge.kind !== "type-only") {
    return false;
  }

  if (!isUnderSrc(edge.from)) {
    return false;
  }

  if (!isUnderTests(edge.to)) {
    return false;
  }

  return true;
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
  left: RevTestdep001Violation,
  right: RevTestdep001Violation,
): number {
  if (left.from !== right.from) {
    return left.from < right.from ? -1 : 1;
  }

  if (left.to !== right.to) {
    return left.to < right.to ? -1 : 1;
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

export function evaluateRevTestdep001(
  context: AnalysisContext,
  options?: RevTestdep001Options,
): RevTestdep001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevTestdep001Violation[] = [];

  for (const edge of context.allModuleEdges()) {
    if (!isRevTestdep001Violation(edge)) {
      continue;
    }

    violations.push({
      from: edge.from,
      to: edge.to,
      rawSpecifier: edge.rawSpecifier,
      kind: edge.kind,
      via: edge.via,
      importedNames: edge.importedNames ? [...edge.importedNames] : undefined,
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
