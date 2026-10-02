import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-NOOUT-001 — Zero Outbound Module Edges.
 *
 * Observational fact over existing ModuleEdge facts: a module
 * under `src/**` has zero qualifying outbound resolved internal
 * module edges.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - reportee universe: canonical paths whose first segment is exactly
 *   `src`. `tests/**`, `dist/**`, and all other paths are never
 *   reportees. No extension filter is applied.
 * - qualifying outbound edge: `edge.from === module` AND
 *   `edge.to !== null` AND `edge.kind` is `runtime` or `type-only`.
 *   Every resolved `via` (`import`, `export-from`, `export-star`,
 *   `re-export-namespace`) participates equally.
 * - target-path policy: ANY resolved internal target counts,
 *   regardless of target path segment. `src/** -> tests/**`,
 *   `src/** -> docs/**`, etc. all count as outbound if resolved.
 * - self-import counts: `edge.from === edge.to` satisfies the
 *   predicate, so a module whose only outbound edge is a self-import
 *   does NOT qualify for this rule. REV-SELFIMPORT-001 owns the
 *   self-import finding.
 * - duplicates are irrelevant: any qualifying outbound edge means
 *   the module has outbound edges. Zero-vs-nonzero classification.
 * - cardinality: exactly one finding per qualifying `src/**` module.
 * - evidence is exactly two keys: `module` and the `scope` universe
 *   constant. No severity, confidence, message, remediation, location,
 *   edge counts, target arrays, raw specifiers, kinds, vias, or
 *   generic finding metadata is produced.
 * - deterministic: the reportable universe enumerates in sorted
 *   canonical order and findings sort by module with UTF-16 code-unit
 *   ordering — never `localeCompare`.
 * - readonly: context-owned edges, arrays, and tables are never
 *   mutated. Every violation object is newly allocated per evaluation;
 *   repeated evaluation yields equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - path aliases and package `#imports` collapse to `external` edges
 *   and therefore cannot establish outbound edges.
 * - dynamic `import()`, non-literal module loading, and `require()`
 *   produce no module edge.
 * - external consumers, framework registration, reflection, and
 *   dependency injection mechanisms are invisible to the module graph.
 * A finding therefore establishes only that no qualifying outbound
 * resolved internal module edge was observed from this `src/**` module
 * in the supplied analysis universe — never that a module is dead,
 * unused, unreachable, or an entry point.
 */

export interface RevNoout001Violation {
  readonly module: CanonicalPath;
  readonly scope: "src/**";
}

export interface RevNoout001Options {
  readonly applicable?: boolean;
}

export type RevNoout001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | { readonly evaluated: true; readonly violations: RevNoout001Violation[] };

const REPORTABLE_SCOPE = "src/**" as const;

function isUnderSrc(canonicalPath: CanonicalPath): boolean {
  return canonicalPath.split("/")[0] === "src";
}

function isQualifyingOutboundEdge(edge: ModuleEdge): boolean {
  if (edge.to === null) {
    return false;
  }

  return edge.kind === "runtime" || edge.kind === "type-only";
}

function compareModules(left: CanonicalPath, right: CanonicalPath): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

export function evaluateRevNoout001(
  context: AnalysisContext,
  options?: RevNoout001Options,
): RevNoout001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const reportableModules: CanonicalPath[] = [];

  for (const path of context.canonicalPaths) {
    if (isUnderSrc(path)) {
      reportableModules.push(path);
    }
  }

  const hasOutbound = new Set<CanonicalPath>();

  for (const edge of context.allModuleEdges()) {
    if (!isQualifyingOutboundEdge(edge)) {
      continue;
    }

    if (hasOutbound.has(edge.from)) {
      continue;
    }

    if (isUnderSrc(edge.from)) {
      hasOutbound.add(edge.from);
    }
  }

  const violations: RevNoout001Violation[] = [];

  for (const module of reportableModules) {
    if (!hasOutbound.has(module)) {
      violations.push({ module, scope: REPORTABLE_SCOPE });
    }
  }

  violations.sort((left, right) => compareModules(left.module, right.module));

  return { evaluated: true, violations };
}