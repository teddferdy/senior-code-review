import type { AnalysisContext } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationRecord,
  SymbolId,
} from "./declaration-ids.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-OVERLOADPARTIAL-001 — Overload Set Partial Usage.
 *
 * Family-level observation over represented V1 call edges: an overload
 * family is reported when at least one eligible overload signature has a
 * represented inbound V1 call edge and at least one other eligible
 * signature has none.
 *
 * Locked semantics:
 * - family identity is shared DeclarationRecord.symbolId;
 * - member identity is DeclarationRecord.id;
 * - eligible members are exactly kind === "overload" outside tests/**;
 * - implementation bodies are excluded, even when they share a family symbol;
 * - observation is declaration-ID specific and caller-agnostic;
 * - unobserved means zero represented inbound V1 edges, not global non-use.
 */

export interface RevOverloadpartial001Member {
  readonly declarationId: DeclarationId;
  readonly line: number;
  readonly overloadIndex: number;
}

export interface RevOverloadpartial001Violation {
  readonly familySymbolId: SymbolId;
  readonly file: CanonicalPath;
  readonly name: string;
  readonly qualifiedName: string;
  readonly observedMembers: RevOverloadpartial001Member[];
  readonly unobservedMembers: RevOverloadpartial001Member[];
}

export interface RevOverloadpartial001Options {
  readonly applicable?: boolean;
}

export type RevOverloadpartial001Result =
  | {
      readonly evaluated: false;
      readonly violations: readonly [];
    }
  | {
      readonly evaluated: true;
      readonly violations: RevOverloadpartial001Violation[];
    };

function isEligibleMember(record: DeclarationRecord): boolean {
  return (
    record.kind === "overload" && record.file.split("/")[0] !== "tests"
  );
}

function compareMembers(
  left: DeclarationRecord,
  right: DeclarationRecord,
): number {
  if (left.overloadIndex !== right.overloadIndex) {
    return left.overloadIndex < right.overloadIndex ? -1 : 1;
  }

  if (left.id !== right.id) {
    return left.id < right.id ? -1 : 1;
  }

  return 0;
}

function toMember(record: DeclarationRecord): RevOverloadpartial001Member {
  return {
    declarationId: record.id,
    line: record.line,
    overloadIndex: record.overloadIndex,
  };
}

export function evaluateRevOverloadpartial001(
  context: AnalysisContext,
  options?: RevOverloadpartial001Options,
): RevOverloadpartial001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const membersByFamily = new Map<SymbolId, DeclarationRecord[]>();

  for (const record of context.allDeclarations()) {
    if (!isEligibleMember(record)) {
      continue;
    }

    const members = membersByFamily.get(record.symbolId);

    if (members) {
      members.push(record);
    } else {
      membersByFamily.set(record.symbolId, [record]);
    }
  }

  const observed = new Set<DeclarationId>();

  for (const edge of buildV1CallGraph(context).edges) {
    observed.add(edge.calleeId);
  }

  const violations: RevOverloadpartial001Violation[] = [];

  for (const [familySymbolId, members] of membersByFamily) {
    if (members.length < 2) {
      continue;
    }

    const ordered = [...members].sort(compareMembers);
    const observedMembers: RevOverloadpartial001Member[] = [];
    const unobservedMembers: RevOverloadpartial001Member[] = [];

    for (const member of ordered) {
      if (observed.has(member.id)) {
        observedMembers.push(toMember(member));
      } else {
        unobservedMembers.push(toMember(member));
      }
    }

    if (observedMembers.length === 0 || unobservedMembers.length === 0) {
      continue;
    }

    const representative = ordered[0] as DeclarationRecord;

    violations.push({
      familySymbolId,
      file: representative.file,
      name: representative.name,
      qualifiedName: representative.qualifiedName,
      observedMembers,
      unobservedMembers,
    });
  }

  violations.sort((left, right) => {
    if (left.familySymbolId !== right.familySymbolId) {
      return left.familySymbolId < right.familySymbolId ? -1 : 1;
    }

    return 0;
  });

  return { evaluated: true, violations };
}
