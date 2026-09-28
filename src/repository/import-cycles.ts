import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";

/*
 * Internal import-cycle analysis over the V1 source-backed module edges.
 *
 * Pure derivation: consumes `context.canonicalPaths` and
 * `context.allModuleEdges()` only. Never touches the filesystem, tsconfig,
 * baseUrl/paths, the legacy import-map, or `buildDependencyGraph()`.
 *
 * Locked semantics:
 * - internal edge  <=>  `edge.to !== null` (runtime and type-only alike);
 *   external and unresolved edges are ignored for traversal.
 * - every resolved `via` participates (import, export-from, export-star,
 *   re-export-namespace); alias records are not consulted.
 * - self-loops (`A -> A`) are ignored for reporting; the underlying edge
 *   list is never modified.
 * - duplicate `from -> to` topology collapses to a single adjacency entry.
 * - output is canonical closed canonical-path loops (`[A, B, C, A]`),
 *   rotation-normalized to the lexicographically smallest starting path,
 *   deduplicated, and sorted deterministically.
 * - no severity, confidence, finding, rule, location, or SCC model.
 */

function canonicalizeCycle(raw: readonly CanonicalPath[]): CanonicalPath[] {
  const core = raw.slice(0, raw.length - 1);

  let smallest = 0;

  for (let index = 1; index < core.length; index += 1) {
    if ((core[index] as string) < (core[smallest] as string)) {
      smallest = index;
    }
  }

  const rotated = [
    ...core.slice(smallest),
    ...core.slice(0, smallest),
  ];

  return [...rotated, rotated[0] as CanonicalPath];
}

function compareCycles(
  left: readonly CanonicalPath[],
  right: readonly CanonicalPath[],
): number {
  const shared = Math.min(left.length, right.length);

  for (let index = 0; index < shared; index += 1) {
    const a = left[index] as string;
    const b = right[index] as string;

    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }

  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }

  return 0;
}

export function analyzeImportCycles(
  context: AnalysisContext,
): CanonicalPath[][] {
  const nodeSet = new Set<CanonicalPath>(context.canonicalPaths);

  for (const edge of context.allModuleEdges()) {
    if (edge.to === null || edge.to === edge.from) {
      continue;
    }

    nodeSet.add(edge.from);
    nodeSet.add(edge.to);
  }

  const nodes = [...nodeSet].sort();

  const adjacency = new Map<CanonicalPath, CanonicalPath[]>();

  for (const node of nodes) {
    adjacency.set(node, []);
  }

  const seenPairs = new Set<string>();

  for (const edge of context.allModuleEdges()) {
    if (edge.to === null || edge.to === edge.from) {
      continue;
    }

    const pairKey = `${edge.from}\0${edge.to}`;

    if (seenPairs.has(pairKey)) {
      continue;
    }

    seenPairs.add(pairKey);
    (adjacency.get(edge.from) as CanonicalPath[]).push(edge.to);
  }

  for (const neighbors of adjacency.values()) {
    neighbors.sort();
  }

  const cycles: CanonicalPath[][] = [];
  const seenCycles = new Set<string>();
  const visited = new Set<CanonicalPath>();
  const visiting = new Set<CanonicalPath>();

  function visit(file: CanonicalPath, path: CanonicalPath[]): void {
    if (visiting.has(file)) {
      const cycleStart = path.indexOf(file);

      if (cycleStart !== -1) {
        const canonical = canonicalizeCycle(path.slice(cycleStart));
        const cycleKey = canonical.join("\0");

        if (!seenCycles.has(cycleKey)) {
          seenCycles.add(cycleKey);
          cycles.push(canonical);
        }
      }

      return;
    }

    if (visited.has(file)) {
      return;
    }

    visiting.add(file);

    for (const dependency of adjacency.get(file) ?? []) {
      visit(dependency, [...path, dependency]);
    }

    visiting.delete(file);
    visited.add(file);
  }

  for (const node of nodes) {
    visit(node, [node]);
  }

  cycles.sort(compareCycles);

  return cycles;
}
