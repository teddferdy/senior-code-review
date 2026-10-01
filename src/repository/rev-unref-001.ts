import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-UNREF-001 — Unreferenced Module Review.
 *
 * Zero-inbound-reference fact over existing ModuleEdge facts: a module
 * under root-anchored `src/**` is reported when no qualifying resolved
 * internal ModuleEdge points to it from an eligible source module.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - reportable universe: canonical paths whose first segment is exactly
 *   `src`. `tests/**`, `dist/**`, and all other paths are never
 *   reportees. No extension filter is applied.
 * - referrer/reportee asymmetry: edges emitted from `src/**` or
 *   `tests/**` modules establish references; `tests/**` modules are
 *   never reportees. A staged `src/**.test.ts` file is literally under
 *   `src/**`, so it is both a reportee candidate and a referrer.
 * - a module is referenced when some edge has `to` equal to the module
 *   and `from` under `src/**` or `tests/**`. By the established
 *   substrate invariant, `to !== null` implies `kind` is `runtime` or
 *   `type-only`, and every `via` (`import`, `export-from`,
 *   `export-star`, `re-export-namespace`) counts — so no separate kind
 *   filter is required. `unresolved` and `external` edges have
 *   `to === null` and can never establish a reference.
 * - self-loops count: a resolved `A -> A` edge satisfies every
 *   reference condition, so a self-loop-only module is referenced, not
 *   unreferenced. REV-SELFIMPORT-001 owns the self-loop itself.
 * - cycles are irrelevant: this rule computes inbound degree, not
 *   reachability, so no traversal, queue, or visited state exists.
 * - cardinality: exactly one finding per unreferenced reportable
 *   module. Duplicate and parallel edges collapse naturally because
 *   only set membership is consulted.
 * - deterministic: the reportable universe enumerates in sorted
 *   canonical order and findings sort by module with UTF-16 code-unit
 *   ordering — never `localeCompare`.
 * - evidence is exactly two keys: `module` and the `scope` universe
 *   constant. No severity, confidence, message, remediation, location,
 *   inboundEdges, or generic finding metadata is produced.
 * - readonly: context-owned edges, arrays, and tables are never
 *   mutated. Every violation object is newly allocated per evaluation;
 *   repeated evaluation yields equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - path aliases and package `#imports` collapse to `external` edges
 *   and therefore cannot establish references.
 * - dynamic `import()`, non-literal module loading, and `require()`
 *   produce no module edge.
 * - external consumers, framework registration, reflection, and
 *   dependency injection mechanisms are invisible to the module graph.
 * A finding therefore establishes only that no qualifying inbound
 * internal reference was observed under scope `src/**` — never that a
 * module is definitely unused.
 */

export interface RevUnref001Violation {
  readonly module: CanonicalPath;
  readonly scope: "src/**";
}

export interface RevUnref001Options {
  readonly applicable?: boolean;
}

export type RevUnref001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevUnref001Violation[];
    };

const REPORTABLE_SCOPE = "src/**" as const;

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderSrc(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "src";
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "tests";
}

function isEligibleReferrer(canonicalPath: CanonicalPath): boolean {
  return isUnderSrc(canonicalPath) || isUnderTests(canonicalPath);
}

function compareModules(left: CanonicalPath, right: CanonicalPath): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

/*
 * Inbound-degree fact: the set of modules that have at least one
 * qualifying inbound reference. Every table edge with a non-null `to`
 * from an eligible referrer qualifies by the substrate invariant, so
 * membership alone decides referenced vs unreferenced.
 */
function collectReferencedModules(
  edges: readonly ModuleEdge[],
): Set<CanonicalPath> {
  const referenced = new Set<CanonicalPath>();

  for (const edge of edges) {
    if (edge.to === null || !isEligibleReferrer(edge.from)) {
      continue;
    }

    referenced.add(edge.to);
  }

  return referenced;
}

export function evaluateRevUnref001(
  context: AnalysisContext,
  options?: RevUnref001Options,
): RevUnref001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const referenced = collectReferencedModules(context.allModuleEdges());
  const violations: RevUnref001Violation[] = [];

  for (const candidate of context.canonicalPaths) {
    if (!isUnderSrc(candidate) || referenced.has(candidate)) {
      continue;
    }

    violations.push({ module: candidate, scope: REPORTABLE_SCOPE });
  }

  violations.sort((left, right) => compareModules(left.module, right.module));

  return { evaluated: true, violations };
}
