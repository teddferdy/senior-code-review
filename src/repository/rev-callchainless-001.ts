import type { AnalysisContext } from "./analysis-context.js";
import { resolveCallModuleEdges } from "./call-module-edges.js";
import type {
  CanonicalPath,
  DeclarationId,
} from "./declaration-ids.js";
import type { V1CallEdge } from "./v1-call-graph.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-CALLCHAINLESS-001 — Unlinked Cross-File Call Review.
 *
 * Observational predicate over represented V1 call edges and the
 * licensed module-edge relationship for each call: a cross-file call
 * whose caller and callee declarations resolve to different files,
 * but for which `resolveCallModuleEdges()` observes no direct or
 * licensed-transitive module-edge relationship.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - violation iff, for one represented V1 call edge: caller and callee
 *   declarations both resolve; caller.file !== callee.file; the caller
 *   file top path segment is not exactly `tests`; and
 *   `resolveCallModuleEdges(context, edge)` returns `[]`. Exactly one
 *   violation per qualifying V1 call edge.
 * - the empty resolver result is interpreted only after the edge is
 *   established as a represented cross-file V1 call with a non-test
 *   caller. `[]` alone is insufficient: same-file calls and
 *   unresolvable endpoints also resolve to `[]` and are excluded by
 *   the earlier gates, never reported.
 * - direct relationships (any direct caller.file -> callee.file module
 *   edge, of any kind or via) and licensed transitive barrel chains
 *   both yield non-empty resolver output and therefore never qualify.
 *   Type-only direct edges count as relationships: the rule observes
 *   module relationships, not runtime behaviour.
 * - caller scope: only the caller file is scoped. Callee files are
 *   unrestricted, so a non-test caller reaching a `tests/**`
 *   declaration with no licensed relationship is reportable. The
 *   filename-based `file-classifier.ts` heuristic is never consulted.
 * - no binding inference: `importedNames`, raw specifiers, and import
 *   syntax are never read. The rule consumes the V1 edge (whose
 *   checker binding is already established upstream) and the licensed
 *   resolver verdict as a black box. It never asks which import
 *   statement corresponds to a call, never infers a missing import,
 *   and never labels a mechanism (global, ambient, missing-dependency).
 *   This is the locked boundary against REV-CALLNOEDGE-001 territory.
 * - no CALLBOUND coupling: REV-CALLBOUND-001 is not imported. A chain
 *   containing an ARCH violation is non-empty and therefore excluded
 *   here; the two rules are disjoint by construction.
 * - every represented V1 edge is evaluated uniformly: no callee-kind
 *   filtering, so checker-selected overload, alias-mediated, and
 *   interface/polymorphic dispatch edges participate exactly as the V1
 *   graph represents them.
 * - evidence is exactly six keys: `callerDeclarationId`,
 *   `calleeDeclarationId`, `callerFile`, `calleeFile`, and `callSite`
 *   (`file`, 1-based `line`). No severity, confidence, message,
 *   remediation, mechanism, resolver path, module edge, importedNames,
 *   or specifier is produced or implied.
 * - readonly: `AnalysisContext`, the V1 call graph, declaration
 *   records, module-edge arrays, alias records, and resolver output
 *   are never mutated or retained. Every violation object and every
 *   nested call-site record is newly allocated per evaluation.
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (callerDeclarationId, calleeDeclarationId,
 *   callSite.file, callSite.line) using UTF-16 code-unit comparison.
 *   V1 edges arrive pre-sorted and the sort is stable. Repeated
 *   evaluation yields equivalent independent results.
 */

export interface RevCallchainless001CallSite {
  readonly file: CanonicalPath;
  readonly line: number;
}

export interface RevCallchainless001Violation {
  readonly callerDeclarationId: DeclarationId;
  readonly calleeDeclarationId: DeclarationId;
  readonly callerFile: CanonicalPath;
  readonly calleeFile: CanonicalPath;
  readonly callSite: RevCallchainless001CallSite;
}

export interface RevCallchainless001Options {
  readonly applicable?: boolean;
}

export type RevCallchainless001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevCallchainless001Violation[];
    };

interface InspectedCall {
  readonly callerFile: CanonicalPath;
  readonly calleeFile: CanonicalPath;
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return canonicalPath.split("/")[0] === "tests";
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

  if (isUnderTests(caller.file)) {
    return undefined;
  }

  if (resolveCallModuleEdges(context, edge).length !== 0) {
    return undefined;
  }

  return { callerFile: caller.file, calleeFile: callee.file };
}

/**
 * Whether a V1 call edge violates REV-CALLCHAINLESS-001: a represented
 * cross-file call with a non-test caller for which the licensed
 * module-edge resolver observes no relationship. Consumes the upstream
 * V1 graph and resolver output only; nothing is re-derived and no
 * binding inference is performed.
 */
export function isRevCallchainless001Violation(
  context: AnalysisContext,
  edge: V1CallEdge,
): boolean {
  return inspectCallEdge(context, edge) !== undefined;
}

function compareViolations(
  left: RevCallchainless001Violation,
  right: RevCallchainless001Violation,
): number {
  if (left.callerDeclarationId !== right.callerDeclarationId) {
    return left.callerDeclarationId < right.callerDeclarationId ? -1 : 1;
  }

  if (left.calleeDeclarationId !== right.calleeDeclarationId) {
    return left.calleeDeclarationId < right.calleeDeclarationId ? -1 : 1;
  }

  if (left.callSite.file !== right.callSite.file) {
    return left.callSite.file < right.callSite.file ? -1 : 1;
  }

  if (left.callSite.line !== right.callSite.line) {
    return left.callSite.line < right.callSite.line ? -1 : 1;
  }

  return 0;
}

export function evaluateRevCallchainless001(
  context: AnalysisContext,
  options?: RevCallchainless001Options,
): RevCallchainless001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const violations: RevCallchainless001Violation[] = [];

  for (const edge of graph.edges) {
    const inspected = inspectCallEdge(context, edge);

    if (!inspected) {
      continue;
    }

    violations.push({
      callerDeclarationId: edge.callerId,
      calleeDeclarationId: edge.calleeId,
      callerFile: inspected.callerFile,
      calleeFile: inspected.calleeFile,
      callSite: {
        file: edge.callSite.file,
        line: edge.callSite.line,
      },
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
