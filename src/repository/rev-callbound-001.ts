import type { AnalysisContext } from "./analysis-context.js";
import { resolveCallModuleEdges } from "./call-module-edges.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";
import type { V1CallEdge } from "./v1-call-graph.js";
import { buildV1CallGraph } from "./v1-call-graph.js";
import {
  REV_ARCH_001_BOUNDARY,
  isRevArch001Violation,
} from "./rev-arch-001.js";

/*
 * REV-CALLBOUND-001 — Transitive Boundary-Crossing Call Review.
 *
 * Call-level predicate over resolved V1 call edges and their licensed
 * module-level relationships: a cross-file call whose module-edge chain
 * passes through the REV-ARCH-001 architectural boundary transitively.
 * This rule reports call-level information REV-ARCH-001 cannot provide
 * because REV-ARCH-001 is direct-edge-only.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - violation iff, for one V1 call edge: caller and callee resolve to
 *   declarations in different files; `resolveCallModuleEdges()` returns
 *   a strictly transitive chain; and at least one chain edge satisfies
 *   the existing exported `isRevArch001Violation()`. Exactly one
 *   violation per qualifying V1 call edge.
 * - strictly transitive: the chain must contain at least two module
 *   edges forming one contiguous caller-to-callee path (first edge
 *   leaves the caller file, last edge enters the callee file, every
 *   consecutive pair links). A single direct edge therefore never
 *   qualifies, and neither does a bundle of duplicate direct edges
 *   (duplicates share one from/to pair and cannot form a contiguous
 *   path through an intermediate file). Direct boundary calls are
 *   excluded by construction, so no finding duplicates REV-ARCH-001.
 * - empty relationships never violate. Same-file calls, chainless
 *   cross-file calls, and stale/foreign edges all resolve to `[]` and
 *   are non-violating. Candidate-A territory is deferred, not reported.
 * - unresolved/unsupported calls produce no V1 call edge at all and are
 *   therefore invisible here; no explicit handling exists or is needed.
 * - the chain is consumed exactly as `resolveCallModuleEdges()` returns
 *   it: no independent reconstruction, normalization, filtering, or
 *   reinterpretation. External and unresolved edges never appear in a
 *   returned chain and are never re-derived.
 * - alias/barrel behavior is inherited: named legs beyond the caller
 *   file participate only with alias evidence, star and namespace legs
 *   structurally, exactly as the licensed resolver decides.
 * - boundary reuse: `REV_ARCH_001_BOUNDARY` and `isRevArch001Violation()`
 *   are imported and authoritative. No second boundary constant, no
 *   configuration, no parameterization, no architecture-policy
 *   abstraction is introduced here.
 * - evidence is exactly five keys: `callerFile`, `calleeFile`,
 *   `callSite` (`file`, 1-based `line`), `boundary`, and `chain`. Each
 *   chain entry copies `from`, `to`, `rawSpecifier`, `kind`, and `via`.
 *   No severity, confidence, message, remediation, column, target,
 *   importedNames, or generic finding metadata is produced or implied.
 * - readonly: `AnalysisContext`, the V1 call graph, declaration
 *   records, module-edge arrays, and resolver output are never mutated.
 *   Every violation object, call-site record, chain array, and chain
 *   entry is newly allocated per evaluation.
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (callerFile, calleeFile, callSite.file, callSite.line)
 *   using UTF-16 code-unit comparison. V1 edges arrive pre-sorted and
 *   the sort is stable, so fully identical orderings retain emission
 *   order. Repeated evaluation yields equivalent independent results.
 */

export interface RevCallbound001ChainEdge {
  readonly from: CanonicalPath;
  readonly to: CanonicalPath | null;
  readonly rawSpecifier: string;
  readonly kind: ModuleEdge["kind"];
  readonly via: ModuleEdge["via"];
}

export interface RevCallbound001CallSite {
  readonly file: CanonicalPath;
  readonly line: number;
}

export interface RevCallbound001Violation {
  readonly callerFile: CanonicalPath;
  readonly calleeFile: CanonicalPath;
  readonly callSite: RevCallbound001CallSite;
  readonly boundary: typeof REV_ARCH_001_BOUNDARY;
  readonly chain: RevCallbound001ChainEdge[];
}

export interface RevCallbound001Options {
  readonly applicable?: boolean;
}

export type RevCallbound001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevCallbound001Violation[];
    };

interface InspectedCall {
  readonly callerFile: CanonicalPath;
  readonly calleeFile: CanonicalPath;
  readonly chain: readonly ModuleEdge[];
}

function isStrictlyTransitiveChain(
  chain: readonly ModuleEdge[],
  callerFile: CanonicalPath,
  calleeFile: CanonicalPath,
): boolean {
  if (chain.length < 2) {
    return false;
  }

  if (chain[0].from !== callerFile) {
    return false;
  }

  if (chain[chain.length - 1].to !== calleeFile) {
    return false;
  }

  for (let index = 1; index < chain.length; index += 1) {
    if (chain[index].from !== chain[index - 1].to) {
      return false;
    }
  }

  return true;
}

function inspectCallEdge(
  context: AnalysisContext,
  edge: V1CallEdge,
): InspectedCall | undefined {
  const caller = context.declarationOf(edge.callerId);
  const callee = context.declarationOf(edge.calleeId);

  if (!caller || !callee) {
    return undefined;
  }

  if (caller.file === callee.file) {
    return undefined;
  }

  const chain = resolveCallModuleEdges(context, edge);

  if (!isStrictlyTransitiveChain(chain, caller.file, callee.file)) {
    return undefined;
  }

  if (!chain.some((entry) => isRevArch001Violation(entry))) {
    return undefined;
  }

  return { callerFile: caller.file, calleeFile: callee.file, chain };
}

/**
 * Whether a V1 call edge violates REV-CALLBOUND-001: a cross-file call
 * whose licensed module-edge chain is strictly transitive and contains
 * at least one REV-ARCH-001 boundary-violating edge. Consumes the
 * upstream V1 graph and resolver output only; nothing is re-derived.
 */
export function isRevCallbound001Violation(
  context: AnalysisContext,
  edge: V1CallEdge,
): boolean {
  return inspectCallEdge(context, edge) !== undefined;
}

function compareViolations(
  left: RevCallbound001Violation,
  right: RevCallbound001Violation,
): number {
  if (left.callerFile !== right.callerFile) {
    return left.callerFile < right.callerFile ? -1 : 1;
  }

  if (left.calleeFile !== right.calleeFile) {
    return left.calleeFile < right.calleeFile ? -1 : 1;
  }

  if (left.callSite.file !== right.callSite.file) {
    return left.callSite.file < right.callSite.file ? -1 : 1;
  }

  if (left.callSite.line !== right.callSite.line) {
    return left.callSite.line < right.callSite.line ? -1 : 1;
  }

  return 0;
}

export function evaluateRevCallbound001(
  context: AnalysisContext,
  options?: RevCallbound001Options,
): RevCallbound001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const violations: RevCallbound001Violation[] = [];

  for (const edge of graph.edges) {
    const inspected = inspectCallEdge(context, edge);

    if (!inspected) {
      continue;
    }

    violations.push({
      callerFile: inspected.callerFile,
      calleeFile: inspected.calleeFile,
      callSite: {
        file: edge.callSite.file,
        line: edge.callSite.line,
      },
      boundary: REV_ARCH_001_BOUNDARY,
      chain: inspected.chain.map((entry) => ({
        from: entry.from,
        to: entry.to,
        rawSpecifier: entry.rawSpecifier,
        kind: entry.kind,
        via: entry.via,
      })),
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
