import type { AnalysisContext } from "./analysis-context.js";
import type {
  CallGraph,
  CallGraphEdge,
} from "./call-graph.js";
import type {
  DeclarationId,
  SymbolId,
} from "./declaration-ids.js";

/*
 * Source-backed Analysis Context V1 — call-graph identity sidecar.
 *
 * Correlates (never re-resolves) legacy CallGraph edges to stable
 * DeclarationId / SymbolId values owned by an AnalysisContext.
 * Legacy CallGraphNode / CallGraphEdge / buildCallGraph semantics are
 * untouched; ambiguity yields absence, never a guess.
 */

export interface CallGraphIdentity {
  graph: CallGraph;
  callerIds: Map<CallGraphEdge, DeclarationId>;
  calleeIds: Map<CallGraphEdge, DeclarationId>;
  calleeSymbols: Map<CallGraphEdge, SymbolId>;
}

export function correlateCallGraph(
  context: AnalysisContext,
  graph: CallGraph,
): CallGraphIdentity {
  const callerIds = new Map<CallGraphEdge, DeclarationId>();
  const calleeIds = new Map<CallGraphEdge, DeclarationId>();
  const calleeSymbols = new Map<CallGraphEdge, SymbolId>();

  for (const edge of graph.edges) {
    const callerId = context.resolveDeclaration(edge.caller);

    if (callerId !== undefined) {
      callerIds.set(edge, callerId);
    }

    const calleeId = context.resolveDeclaration(edge.callee);

    if (calleeId !== undefined) {
      calleeIds.set(edge, calleeId);

      const record = context.declarationOf(calleeId);

      if (record) {
        calleeSymbols.set(edge, record.symbolId);
      }
    }
  }

  return { graph, callerIds, calleeIds, calleeSymbols };
}
