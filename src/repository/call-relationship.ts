import type { AnalysisContext } from "./analysis-context.js";
import { resolveCallModuleEdges } from "./call-module-edges.js";
import type { DeclarationRecord } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";
import type { V1CallEdge } from "./v1-call-graph.js";

/*
 * Resolved call relationship (composition query).
 *
 * Pure, read-only derivation over an existing AnalysisContext and a
 * V1CallEdge. Joins the call edge's canonical endpoint declarations
 * with the module-level relationship for that call, as computed by
 * the audited resolveCallModuleEdges() query.
 *
 * Locked semantics:
 * - endpoints resolve through context.declarationOf; an unresolvable
 *   caller or callee yields undefined (the ONLY undefined condition).
 * - resolved endpoints always yield a relationship, even same-file
 *   (moduleEdges: []) or chainless (moduleEdges: []) calls.
 * - moduleEdges is exactly the resolver result: same refs, same order,
 *   no filtering, no traversal, no synthetics; all module semantics
 *   (direct/duplicates/barrel/licensing/type-only) are delegated.
 * - caller/callee are the exact context-owned DeclarationRecord
 *   objects; no cloning, no SymbolRecord, no extra fields.
 * - the input V1CallEdge is never modified; no program, checker,
 *   filesystem, graph rebuild, cache, or global state.
 */

export interface CallRelationship {
  caller: DeclarationRecord;
  callee: DeclarationRecord;
  moduleEdges: ModuleEdge[];
}

export function resolveCallRelationship(
  context: AnalysisContext,
  edge: V1CallEdge,
): CallRelationship | undefined {
  const caller = context.declarationOf(edge.callerId);
  const callee = context.declarationOf(edge.calleeId);

  if (!caller || !callee) {
    return undefined;
  }

  return {
    caller,
    callee,
    moduleEdges: resolveCallModuleEdges(context, edge),
  };
}
