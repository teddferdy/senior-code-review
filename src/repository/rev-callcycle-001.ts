import type { AnalysisContext } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationKind,
} from "./declaration-ids.js";
import type { V1CallEdge } from "./v1-call-graph.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-CALLCYCLE-001 — Observed Call Cycle Review.
 *
 * Existence fact over resolved V1 call edges: a directed cycle in the
 * represented call graph is reported as an observed call cycle. The
 * rule claims only that the V1 call graph contains the cycle — never
 * that a function is recursive at runtime, never that recursion is
 * infinite, and never that absence of findings means recursion-free.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - universe: DeclarationIds appearing as V1 caller/callee endpoints,
 *   kept only when the declaration record resolves, its kind is one of
 *   `function`, `method`, `objectMethod`, or `overload`, and its file is
 *   not under `tests/**`. Function-valued `property`/`variable`
 *   declarations are excluded even though V1 can emit them. Test-file
 *   declarations never participate and never bridge cycles.
 * - parallel edges collapse by `(callerId, calleeId)`; the retained
 *   edge is the minimum by (`callSite.file`, `callSite.line`), so
 *   call-site multiplicity never multiplies findings.
 * - a cycle is a simple directed cycle: `A -> A`, `A -> B -> A`,
 *   `A -> B -> C -> A`. Reverse orientation is not equivalent.
 *   Enumeration is a rule-local min-vertex-constrained DFS: a cycle is
 *   recorded only from its lexicographically smallest vertex, so each
 *   simple cycle yields exactly one finding. Distinct cycles inside one
 *   strongly connected component remain distinct findings. No SCC
 *   detection is performed.
 * - self-calls are owned by this rule: `A -> A` is a valid length-1
 *   cycle producing exactly one finding. REV-SELFIMPORT-001 remains
 *   exclusively module-level.
 * - evidence is a closed ordered edge list whose declaration sequence
 *   starts at the smallest DeclarationId, preserves orientation, and
 *   satisfies `cycle[last].to === cycle[0].from`. No severity,
 *   confidence, message, remediation, or generic finding metadata is
 *   produced.
 * - deterministic: sorted vertices, sorted adjacency, canonical
 *   rotation, UTF-16 code-unit ordering everywhere — never
 *   `localeCompare`. The same context yields byte-for-byte equivalent
 *   evidence regardless of source insertion order.
 * - readonly: the context and the V1 call graph are never mutated.
 *   Adjacency and evidence are newly allocated per evaluation;
 *   repeated evaluation yields equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - callbacks, function values, constructors, `.call`/`.apply`/`.bind`,
 *   `Reflect`, `eval`, dynamic imports, `require`, dynamic member
 *   access, external calls, top-level callers, overload-ambiguity
 *   omissions, and structural-only dispatch are not represented in V1
 *   call edges and therefore cannot form observed cycles.
 * - function-valued `property`/`variable` declarations and `tests/**`
 *   declarations are excluded from the universe by locked scope.
 * A finding therefore establishes only an observed directed cycle in
 * the represented V1 call graph.
 */

export interface RevCallcycle001CycleEdge {
  readonly from: DeclarationId;
  readonly to: DeclarationId;
  readonly callSite: {
    readonly file: CanonicalPath;
    readonly line: number;
  };
}

export interface RevCallcycle001Violation {
  readonly cycle: RevCallcycle001CycleEdge[];
}

export interface RevCallcycle001Options {
  readonly applicable?: boolean;
}

export type RevCallcycle001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevCallcycle001Violation[];
    };

const IN_SCOPE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "function",
  "method",
  "objectMethod",
  "overload",
]);

function compareIds(left: DeclarationId, right: DeclarationId): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

function compareCallSites(
  left: { readonly file: CanonicalPath; readonly line: number },
  right: { readonly file: CanonicalPath; readonly line: number },
): number {
  if (left.file !== right.file) {
    return left.file < right.file ? -1 : 1;
  }

  if (left.line !== right.line) {
    return left.line < right.line ? -1 : 1;
  }

  return 0;
}

function isInScopeFile(canonicalPath: CanonicalPath): boolean {
  return canonicalPath.split("/")[0] !== "tests";
}

function isInScopeDeclaration(
  context: AnalysisContext,
  id: DeclarationId,
): boolean {
  const record = context.declarationOf(id);

  return (
    record !== undefined &&
    IN_SCOPE_KINDS.has(record.kind) &&
    isInScopeFile(record.file)
  );
}

interface CollapsedEdge {
  readonly from: DeclarationId;
  readonly to: DeclarationId;
  readonly file: CanonicalPath;
  readonly line: number;
}

function pairKey(from: DeclarationId, to: DeclarationId): string {
  return `${from}\0${to}`;
}

/*
 * Collapse parallel V1 edges by (callerId, calleeId), retaining the
 * minimum call site. Edges with an unresolvable or out-of-universe
 * endpoint are dropped.
 */
function collapseEdges(
  context: AnalysisContext,
  edges: readonly V1CallEdge[],
): Map<string, CollapsedEdge> {
  const collapsed = new Map<string, CollapsedEdge>();

  for (const edge of edges) {
    if (
      !isInScopeDeclaration(context, edge.callerId) ||
      !isInScopeDeclaration(context, edge.calleeId)
    ) {
      continue;
    }

    const key = pairKey(edge.callerId, edge.calleeId);
    const existing = collapsed.get(key);

    if (
      existing === undefined ||
      compareCallSites(edge.callSite, {
        file: existing.file,
        line: existing.line,
      }) < 0
    ) {
      collapsed.set(key, {
        from: edge.callerId,
        to: edge.calleeId,
        file: edge.callSite.file,
        line: edge.callSite.line,
      });
    }
  }

  return collapsed;
}

function buildAdjacency(
  collapsed: ReadonlyMap<string, CollapsedEdge>,
): Map<DeclarationId, CollapsedEdge[]> {
  const adjacency = new Map<DeclarationId, CollapsedEdge[]>();

  for (const edge of collapsed.values()) {
    const existing = adjacency.get(edge.from);

    if (existing) {
      existing.push(edge);
    } else {
      adjacency.set(edge.from, [edge]);
    }
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => compareIds(left.to, right.to));
  }

  return adjacency;
}

function compareCycles(
  left: readonly DeclarationId[],
  right: readonly DeclarationId[],
): number {
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const order = compareIds(
      left[index] as DeclarationId,
      right[index] as DeclarationId,
    );

    if (order !== 0) {
      return order;
    }
  }

  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }

  return 0;
}

/*
 * Min-vertex-constrained DFS: a cycle is recorded only when the start
 * vertex is the lexicographically smallest DeclarationId on the
 * closed path, so every simple directed cycle is discovered exactly
 * once, as the rotation beginning at its minimum.
 */
function enumerateCycles(
  vertices: readonly DeclarationId[],
  adjacency: ReadonlyMap<DeclarationId, readonly CollapsedEdge[]>,
): DeclarationId[][] {
  const cycles: DeclarationId[][] = [];
  const seen = new Set<string>();

  for (const start of vertices) {
    const path: DeclarationId[] = [start];
    const onPath = new Set<DeclarationId>([start]);

    const visit = (current: DeclarationId): void => {
      const neighbors = adjacency.get(current) ?? [];

      for (const edge of neighbors) {
        if (edge.to === start) {
          let isMinimum = true;

          for (const vertex of path) {
            if (compareIds(vertex, start) < 0) {
              isMinimum = false;
              break;
            }
          }

          if (isMinimum) {
            const closed = [...path, start];
            const key = closed.join("\0");

            if (!seen.has(key)) {
              seen.add(key);
              cycles.push(closed);
            }
          }

          continue;
        }

        if (onPath.has(edge.to)) {
          continue;
        }

        onPath.add(edge.to);
        path.push(edge.to);
        visit(edge.to);
        path.pop();
        onPath.delete(edge.to);
      }
    };

    visit(start);
  }

  return cycles;
}

function toEvidence(
  closed: readonly DeclarationId[],
  collapsed: ReadonlyMap<string, CollapsedEdge>,
): RevCallcycle001CycleEdge[] {
  const evidence: RevCallcycle001CycleEdge[] = [];

  for (let index = 0; index + 1 < closed.length; index += 1) {
    const from = closed[index] as DeclarationId;
    const to = closed[index + 1] as DeclarationId;
    const edge = collapsed.get(pairKey(from, to)) as CollapsedEdge;

    evidence.push({
      from,
      to,
      callSite: { file: edge.file, line: edge.line },
    });
  }

  return evidence;
}

function compareViolations(
  left: RevCallcycle001Violation,
  right: RevCallcycle001Violation,
): number {
  const shared = Math.min(left.cycle.length, right.cycle.length);

  for (let index = 0; index < shared; index += 1) {
    const leftEdge = left.cycle[index] as RevCallcycle001CycleEdge;
    const rightEdge = right.cycle[index] as RevCallcycle001CycleEdge;
    const fromOrder = compareIds(leftEdge.from, rightEdge.from);

    if (fromOrder !== 0) {
      return fromOrder;
    }

    const toOrder = compareIds(leftEdge.to, rightEdge.to);

    if (toOrder !== 0) {
      return toOrder;
    }

    const siteOrder = compareCallSites(leftEdge.callSite, rightEdge.callSite);

    if (siteOrder !== 0) {
      return siteOrder;
    }
  }

  if (left.cycle.length !== right.cycle.length) {
    return left.cycle.length < right.cycle.length ? -1 : 1;
  }

  return 0;
}

export function evaluateRevCallcycle001(
  context: AnalysisContext,
  options?: RevCallcycle001Options,
): RevCallcycle001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const collapsed = collapseEdges(context, graph.edges);
  const adjacency = buildAdjacency(collapsed);
  const vertexSet = new Set<DeclarationId>();

  for (const edge of collapsed.values()) {
    vertexSet.add(edge.from);
    vertexSet.add(edge.to);
  }

  const vertices = [...vertexSet].sort(compareIds);
  const violations: RevCallcycle001Violation[] = [];

  for (const closed of enumerateCycles(vertices, adjacency)) {
    violations.push({ cycle: toEvidence(closed, collapsed) });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
