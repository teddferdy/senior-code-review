import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";
import {
  REV_ARCH_001_BOUNDARY,
  isRevArch001Violation,
} from "./rev-arch-001.js";

/*
 * REV-ARCH-TRANS-001 — Transitive Module-Level ARCH Reachability Review.
 *
 * Structural predicate over existing ModuleEdge facts: a source module
 * under root-anchored `src/repository/**` reaches a module under
 * root-anchored `src/ui/**` through a genuinely transitive internal
 * dependency path. This rule reports module-level reachability that
 * REV-ARCH-001 cannot provide because REV-ARCH-001 is direct-edge-only,
 * and that REV-CALLBOUND-001 cannot provide because it is call-gated.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - violation iff a contiguous path of resolved internal ModuleEdges
 *   starts under `src/repository/**`, ends under `src/ui/**`,
 *   contains at least two edges, and contains at least one edge
 *   satisfying the imported `isRevArch001Violation()`. Exactly one
 *   violation per qualifying (source, target) pair, carrying the
 *   deterministic shortest qualifying path.
 * - traversal uses only resolved internal edges (`to !== null`,
 *   runtime and type-only alike); every resolved `via` participates;
 *   unresolved and external edges never participate. No alias
 *   resolution is performed: module edges already are the topology,
 *   so licensed-hop semantics from the call composition layer do not
 *   apply here.
 * - duplicate `(from, to)` topology collapses to one adjacency entry;
 *   runtime/type-only parallel edges are one topology relation, and
 *   evidence retains the first edge in deterministic
 *   `allModuleEdges()` table order. Self-loop edges (`A -> A`) are
 *   skipped and can never form or extend a qualifying path.
 * - direct edges never qualify: a length-1 path is not a finding, so no
 *   finding duplicates REV-ARCH-001. A longer path that merely contains
 *   a direct ARCH-violating leg still qualifies; ARCH-001 owns the
 *   edge, this rule owns the path.
 * - product-state BFS is required: traversal state is
 *   `(file, violatedSoFar)` where `violatedSoFar` records whether any
 *   traversed edge already satisfies `isRevArch001Violation()`. A
 *   shorter clean path must never shadow a longer qualifying path to
 *   the same target, so recording (first qualifying generation wins,
 *   one finding per pair) is separated from enqueueing (first state
 *   visit wins, which bounds the work). Plain file-only BFS would be
 *   unsound here.
 * - deterministic: sources enumerate in sorted canonical order over
 *   sorted adjacency with a FIFO queue, yielding the shortest
 *   qualifying path per pair and the lexicographically earliest among
 *   equals, compared with UTF-16 code-unit ordering — never
 *   `localeCompare`. Results sort by (source, target) with path length
 *   and path sequence as inert defensive tie-breakers.
 * - boundary reuse: `REV_ARCH_001_BOUNDARY` and
 *   `isRevArch001Violation()` are imported and authoritative. The only
 *   locally mirrored logic is the root-anchored `src/repository/**`
 *   and `src/ui/**` scope shape, because those helpers are not
 *   exported; no second boundary policy exists here.
 * - evidence is exactly four keys: `source`, `target`, `boundary`,
 *   and `path`. Each path entry copies `from`, `to`, `rawSpecifier`,
 *   `kind`, and `via`. No severity, confidence, message, remediation,
 *   location, importedNames, or generic finding metadata is produced.
 * - readonly: context-owned edges, arrays, and tables are never
 *   mutated. Every violation object, path array, and path entry is
 *   newly allocated per evaluation; repeated evaluation yields
 *   equivalent independent results.
 */

export interface RevArchTrans001PathEdge {
  readonly from: CanonicalPath;
  readonly to: CanonicalPath | null;
  readonly rawSpecifier: string;
  readonly kind: ModuleEdge["kind"];
  readonly via: ModuleEdge["via"];
}

export interface RevArchTrans001Violation {
  readonly source: CanonicalPath;
  readonly target: CanonicalPath;
  readonly boundary: typeof REV_ARCH_001_BOUNDARY;
  readonly path: RevArchTrans001PathEdge[];
}

export interface RevArchTrans001Options {
  readonly applicable?: boolean;
}

export type RevArchTrans001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevArchTrans001Violation[];
    };

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

function comparePaths(
  left: CanonicalPath,
  right: CanonicalPath,
): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

/*
 * Internal-only adjacency in deterministic order: unresolved/external
 * edges and self-loops are skipped, duplicate (from, to) topology
 * keeps the first table-order edge, and each neighbor list sorts by
 * target so BFS generation order is (length, lexicographic).
 */
function buildAdjacency(
  edges: readonly ModuleEdge[],
): Map<CanonicalPath, ModuleEdge[]> {
  const adjacency = new Map<CanonicalPath, ModuleEdge[]>();
  const seenPairs = new Set<string>();

  for (const edge of edges) {
    if (edge.to === null || edge.to === edge.from) {
      continue;
    }

    const pairKey = `${edge.from}\0${edge.to}`;

    if (seenPairs.has(pairKey)) {
      continue;
    }

    seenPairs.add(pairKey);

    const existing = adjacency.get(edge.from);

    if (existing) {
      existing.push(edge);
    } else {
      adjacency.set(edge.from, [edge]);
    }
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => {
      const leftTo = left.to ?? "";
      const rightTo = right.to ?? "";

      if (leftTo !== rightTo) {
        return leftTo < rightTo ? -1 : 1;
      }

      return 0;
    });
  }

  return adjacency;
}

interface QueueEntry {
  file: CanonicalPath;
  violated: boolean;
  path: ModuleEdge[];
}

interface PairFinding {
  target: CanonicalPath;
  path: ModuleEdge[];
}

function stateKey(file: CanonicalPath, violated: boolean): string {
  return `${file}\0${violated ? "1" : "0"}`;
}

/*
 * Deterministic shortest qualifying paths from one source. Recording
 * (first qualifying generation per target wins) is separated from
 * enqueueing (first state visit wins): a shorter clean arrival must
 * neither record nor block a longer qualifying arrival, while visited
 * product states keep the traversal bounded and polynomial.
 */
function findQualifyingPaths(
  adjacency: ReadonlyMap<CanonicalPath, readonly ModuleEdge[]>,
  source: CanonicalPath,
): PairFinding[] {
  const findings: PairFinding[] = [];
  const recorded = new Set<CanonicalPath>();
  const visited = new Set<string>();
  const queue: QueueEntry[] = [{ file: source, violated: false, path: [] }];
  let head = 0;

  visited.add(stateKey(source, false));

  while (head < queue.length) {
    const current = queue[head] as QueueEntry;
    head += 1;

    const legs = adjacency.get(current.file) ?? [];

    for (const edge of legs) {
      if (edge.to === null) {
        continue;
      }

      const next = edge.to;
      const violated = current.violated || isRevArch001Violation(edge);
      const path = [...current.path, edge];

      if (
        isUnderSrcUi(next) &&
        violated &&
        path.length >= 2 &&
        !recorded.has(next)
      ) {
        recorded.add(next);
        findings.push({ target: next, path });
      }

      const key = stateKey(next, violated);

      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ file: next, violated, path });
      }
    }
  }

  return findings;
}

function comparePathEdges(
  left: RevArchTrans001PathEdge,
  right: RevArchTrans001PathEdge,
): number {
  if (left.from !== right.from) {
    return left.from < right.from ? -1 : 1;
  }

  const leftTo = left.to ?? "";
  const rightTo = right.to ?? "";

  if (leftTo !== rightTo) {
    return leftTo < rightTo ? -1 : 1;
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

  return 0;
}

function compareViolations(
  left: RevArchTrans001Violation,
  right: RevArchTrans001Violation,
): number {
  const sourceOrder = comparePaths(left.source, right.source);

  if (sourceOrder !== 0) {
    return sourceOrder;
  }

  const targetOrder = comparePaths(left.target, right.target);

  if (targetOrder !== 0) {
    return targetOrder;
  }

  if (left.path.length !== right.path.length) {
    return left.path.length < right.path.length ? -1 : 1;
  }

  for (let index = 0; index < left.path.length; index += 1) {
    const edgeOrder = comparePathEdges(
      left.path[index] as RevArchTrans001PathEdge,
      right.path[index] as RevArchTrans001PathEdge,
    );

    if (edgeOrder !== 0) {
      return edgeOrder;
    }
  }

  return 0;
}

export function evaluateRevArchTrans001(
  context: AnalysisContext,
  options?: RevArchTrans001Options,
): RevArchTrans001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const adjacency = buildAdjacency(context.allModuleEdges());
  const violations: RevArchTrans001Violation[] = [];

  for (const source of context.canonicalPaths) {
    if (!isUnderSrcRepository(source)) {
      continue;
    }

    for (const finding of findQualifyingPaths(adjacency, source)) {
      violations.push({
        source,
        target: finding.target,
        boundary: REV_ARCH_001_BOUNDARY,
        path: finding.path.map((entry) => ({
          from: entry.from,
          to: entry.to,
          rawSpecifier: entry.rawSpecifier,
          kind: entry.kind,
          via: entry.via,
        })),
      });
    }
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
