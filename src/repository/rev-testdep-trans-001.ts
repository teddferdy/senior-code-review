import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-TESTDEP-TRANS-001 — Transitive Production-to-Test Module Reachability.
 *
 * Structural predicate over existing ModuleEdge facts: a source module
 * under `src/**` reaches a module under `tests/**` through a genuinely
 * transitive resolved internal dependency path. This rule reports the
 * reachability that REV-TESTDEP-001 cannot provide because that rule is
 * direct-edge-only by lock: a chain `src/a -> src/b -> tests/h` yields
 * only the direct `src/b -> tests/h` finding there.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - violation iff a contiguous path of resolved internal ModuleEdges
 *   starts at a `src/**` module, ends at a `tests/**` module, and
 *   contains at least two edges. Exactly one violation per qualifying
 *   (source, target) pair, carrying the deterministic shortest
 *   qualifying path. Length is counted in module edges.
 * - ownership by shortest path: for any (source, target) pair the
 *   shortest resolved internal path decides ownership. Length 1 is
 *   owned exclusively by REV-TESTDEP-001 and never reported here; a
 *   direct one-edge path always suppresses a longer transitive
 *   candidate for the same pair. Length >= 2 is owned here. No pair is
 *   ever reported by both rules.
 * - source scope: the first canonical path segment of the path start
 *   is exactly `src`. Target scope: the first canonical path segment
 *   of the path end is exactly `tests`. Intermediate nodes are
 *   unrestricted: a path may pass through `tests/**` (or any other)
 *   modules, so `src/a -> tests/h -> tests/k` qualifies for
 *   `(src/a, tests/k)` while `(src/a, tests/h)` stays TESTDEP-owned.
 *   `tests/** -> tests/**` pairs never qualify (source gate), and a
 *   finding is never sourced at a `tests/**` module.
 * - traversal uses only resolved internal edges (`to !== null`,
 *   runtime and type-only alike); every resolved `via` (`import`,
 *   `export-from`, `export-star`, `re-export-namespace`) participates.
 *   Unresolved and external edges have `to === null` and can never
 *   form or extend a path. No alias resolution is performed: module
 *   edges already are the topology. No TypeScript resolution is
 *   recomputed, no source text is inspected, no new dependency
 *   discovery is introduced.
 * - duplicate `(from, to)` topology collapses to one adjacency entry,
 *   retaining the first edge in deterministic `allModuleEdges()`
 *   table order; that retained edge supplies the path evidence.
 *   Self-loop edges (`A -> A`) are skipped and can never form or
 *   extend a qualifying path. Duplicate occurrences therefore never
 *   multiply findings.
 * - deterministic: sources enumerate in sorted canonical order over
 *   sorted adjacency with a FIFO queue and first-visit-wins visited
 *   sets, yielding the shortest qualifying path per pair and the
 *   lexicographically earliest among equals, compared with UTF-16
 *   code-unit ordering — never `localeCompare`. Results sort by
 *   (source, target); each pair keeps exactly one path so path
 *   content is inert for finding order.
 * - evidence is exactly three keys: `source`, `target`, and `path`.
 *   Each path entry copies `from`, `to`, `rawSpecifier`, `kind`, and
 *   `via`. Although `to` is typed nullable for precedent
 *   compatibility, every emitted entry has a non-null `to`. No
 *   severity, confidence, message, remediation, boundary,
 *   importedNames, location, or generic finding metadata is produced.
 * - readonly: context-owned edges, arrays, and tables are never
 *   mutated. Every violation object, path array, and path entry is
 *   newly allocated per evaluation; repeated evaluation yields
 *   equivalent independent results.
 * - observational only: a finding establishes that a resolved
 *   transitive production-to-test module dependency is observable in
 *   the supplied universe — never that production code is broken, the
 *   dependency is a bug, tests must never be imported, test utilities
 *   are forbidden, or the dependency is architecturally invalid.
 *
 * Known limitations (documented here, never in violation data):
 * - path aliases and package `#imports` collapse to `external` edges
 *   and therefore cannot form or extend paths.
 * - dynamic `import()`, non-literal module loading, and `require()`
 *   produce no module edge.
 * - the rule cannot distinguish intentionally shared test utilities
 *   from accidental production coupling; the reviewer decides.
 * A finding therefore establishes only an observed resolved
 * transitive dependency from a `src/**` module to a `tests/**`
 * module — never a defect.
 */

export interface RevTestdepTrans001PathEdge {
  readonly from: CanonicalPath;
  readonly to: CanonicalPath | null;
  readonly rawSpecifier: string;
  readonly kind: ModuleEdge["kind"];
  readonly via: ModuleEdge["via"];
}

export interface RevTestdepTrans001Violation {
  readonly source: CanonicalPath;
  readonly target: CanonicalPath;
  readonly path: RevTestdepTrans001PathEdge[];
}

export interface RevTestdepTrans001Options {
  readonly applicable?: boolean;
}

export type RevTestdepTrans001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevTestdepTrans001Violation[];
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
  path: ModuleEdge[];
}

interface PairFinding {
  target: CanonicalPath;
  path: ModuleEdge[];
}

/*
 * Deterministic shortest qualifying paths from one source. Target
 * observation (first arrival wins, at any length) is separated from
 * finding emission (length >= 2 only): BFS layers guarantee the first
 * arrival at a target is a shortest path, so a direct one-edge arrival
 * — owned exclusively by REV-TESTDEP-001 — marks the target seen and
 * suppresses any longer transitive candidate for the same pair. Seen
 * targets are still enqueued on first visit because intermediate
 * nodes — including `tests/**` modules — are unrestricted.
 */
function findQualifyingPaths(
  adjacency: ReadonlyMap<CanonicalPath, readonly ModuleEdge[]>,
  source: CanonicalPath,
): PairFinding[] {
  const findings: PairFinding[] = [];
  const seenTarget = new Set<CanonicalPath>();
  const visited = new Set<CanonicalPath>();
  const queue: QueueEntry[] = [{ file: source, path: [] }];
  let head = 0;

  visited.add(source);

  while (head < queue.length) {
    const current = queue[head] as QueueEntry;
    head += 1;

    const legs = adjacency.get(current.file) ?? [];

    for (const edge of legs) {
      if (edge.to === null) {
        continue;
      }

      const next = edge.to;
      const path = [...current.path, edge];

      if (isUnderTests(next) && !seenTarget.has(next)) {
        seenTarget.add(next);

        if (path.length >= 2) {
          findings.push({ target: next, path });
        }
      }

      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ file: next, path });
      }
    }
  }

  return findings;
}

function compareViolations(
  left: RevTestdepTrans001Violation,
  right: RevTestdepTrans001Violation,
): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
  }

  if (left.target !== right.target) {
    return left.target < right.target ? -1 : 1;
  }

  return 0;
}

export function evaluateRevTestdepTrans001(
  context: AnalysisContext,
  options?: RevTestdepTrans001Options,
): RevTestdepTrans001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const adjacency = buildAdjacency(context.allModuleEdges());
  const sources = [...adjacency.keys()]
    .filter((candidate) => isUnderSrc(candidate))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const violations: RevTestdepTrans001Violation[] = [];

  for (const source of sources) {
    for (const finding of findQualifyingPaths(adjacency, source)) {
      violations.push({
        source,
        target: finding.target,
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
