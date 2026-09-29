import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";
import type { V1CallEdge } from "./v1-call-graph.js";

/*
 * Call-edge to module-edge resolution (composition query).
 *
 * Pure, read-only derivation over an existing AnalysisContext and a
 * V1CallEdge. Resolves the module-level relationship represented by a
 * call: the direct ModuleEdge when caller and callee files share one,
 * otherwise the shortest explanatory chain through re-export/barrel
 * intermediaries. Creates no program, checker, or synthetic edges;
 * never mutates context-owned state.
 *
 * Locked semantics:
 * - endpoints resolve through context.declarationOf; unresolvable
 *   endpoints and same-file calls yield [].
 * - direct matches are purely (from, to) file topology; all matches
 *   are returned in context table order without deduplication or
 *   importedNames/kind filtering.
 * - barrel traversal is BFS over internal edges (to !== null,
 *   runtime and type-only alike). Named legs require alias evidence
 *   (AliasRecord.targetSymbolId with a bound exportedName);
 *   export-star and re-export-namespace legs traverse structurally.
 * - empty result is always []; no null, no synthetics.
 */

interface QueueEntry {
  file: CanonicalPath;
  path: ModuleEdge[];
}

/*
 * Whether an intermediate hop's outgoing edge may carry the callee
 * symbol onward. The caller's own outgoing edges are always eligible
 * (they are the caller's recorded dependency statements; no alias
 * records exist for import statements). Deeper named legs require
 * alias evidence binding the edge's exported name to the callee
 * symbol; star and namespace legs traverse structurally because
 * their alias records intentionally carry no target.
 */
function isLicensedHop(
  hopFile: CanonicalPath,
  callerFile: CanonicalPath,
  moduleEdge: ModuleEdge,
  calleeSymbolId: string,
  aliases: readonly {
    fromFile: CanonicalPath;
    exportedName: string;
    targetSymbolId: string | undefined;
  }[],
): boolean {
  if (hopFile === callerFile) {
    return true;
  }

  if (
    moduleEdge.via === "export-star" ||
    moduleEdge.via === "re-export-namespace"
  ) {
    return true;
  }

  const importedNames = moduleEdge.importedNames ?? [];

  for (const alias of aliases) {
    if (alias.fromFile !== hopFile) {
      continue;
    }

    if (alias.targetSymbolId !== calleeSymbolId) {
      continue;
    }

    if (importedNames.includes(alias.exportedName)) {
      return true;
    }
  }

  return false;
}

export function resolveCallModuleEdges(
  context: AnalysisContext,
  edge: V1CallEdge,
): ModuleEdge[] {
  const caller = context.declarationOf(edge.callerId);
  const callee = context.declarationOf(edge.calleeId);

  if (!caller || !callee) {
    return [];
  }

  const callerFile = caller.file;
  const calleeFile = callee.file;

  if (callerFile === calleeFile) {
    return [];
  }

  const moduleEdges = context.allModuleEdges();

  const direct: ModuleEdge[] = [];

  for (const moduleEdge of moduleEdges) {
    if (moduleEdge.from === callerFile && moduleEdge.to === calleeFile) {
      direct.push(moduleEdge);
    }
  }

  if (direct.length > 0) {
    return direct;
  }

  const calleeSymbolId = callee.symbolId;
  const aliases = context.allAliases();

  const visited = new Set<CanonicalPath>();
  visited.add(callerFile);

  const queue: QueueEntry[] = [{ file: callerFile, path: [] }];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head] as QueueEntry;
    head += 1;

    for (const moduleEdge of moduleEdges) {
      if (moduleEdge.from !== current.file) {
        continue;
      }

      const next = moduleEdge.to;

      if (next === null) {
        continue;
      }

      if (visited.has(next)) {
        continue;
      }

      if (
        !isLicensedHop(
          current.file,
          callerFile,
          moduleEdge,
          calleeSymbolId,
          aliases,
        )
      ) {
        continue;
      }

      const path = [...current.path, moduleEdge];

      if (next === calleeFile) {
        return path;
      }

      visited.add(next);
      queue.push({ file: next, path });
    }
  }

  return [];
}
