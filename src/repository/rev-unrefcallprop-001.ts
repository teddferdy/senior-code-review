import type { AnalysisContext } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationKind,
  DeclarationRecord,
} from "./declaration-ids.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-UNREFCALLPROP-001 — Zero Observed Inbound V1 Calls for
 * Function-Valued Properties/Variables.
 *
 * Inbound-degree fact over existing V1 call-graph facts: a reportable
 * function-valued property/variable declaration is reported when no V1
 * call edge names it as callee. This rule owns the property/variable
 * territory that REV-UNREFCALL-001 deliberately excludes; the two
 * rules are disjoint by declaration kind.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO
 *   EVALUATION, which is neither pass nor fail. The rule is never
 *   universal.
 * - reportable universe: declarations whose kind is `property` or
 *   `variable`, whose file top segment is not `tests`, and whose id
 *   appears as a V1 caller or callee endpoint. V1 endpoint
 *   participation is the locked proxy for function-valuedness: the
 *   upstream V1 eligibility gate admits property/variable anchors
 *   only through its function-valued initializer check, so this rule
 *   consumes that verdict and never re-derives callability. No
 *   initializer is inspected, no second function-valuedness
 *   definition is created, and the module-private upstream helper is
 *   neither imported nor recreated.
 * - a function-valued property/variable participating in zero V1
 *   edges is outside this rule's universe: `DeclarationRecord`
 *   retains no function-valued flag and initializer classification
 *   cannot be independently recovered without redefining upstream
 *   semantics.
 * - `function`, `method`, `overload`, and `objectMethod` declarations
 *   are never reportees here, including zero-inbound ones. That
 *   territory remains owned by REV-UNREFCALL-001. `class` and
 *   `interface` declarations are never reportees either.
 * - `DeclarationRecord.exported` is completely irrelevant to
 *   reportability and is never read, mirroring REV-UNREFCALL-001.
 * - inbound definition: a reportee has observed inbound usage iff
 *   some V1 call edge has `calleeId` equal to the reportee's id. No
 *   caller-side filtering exists: same-file, cross-file, production,
 *   test, and self-call (`callerId === calleeId`) callers all count.
 *   A self-call therefore protects its own declaration.
 * - cardinality: inbound count `== 0` yields exactly one finding;
 *   inbound count `>= 1` yields none. Endpoint participation plus a
 *   callee-id set is sufficient; no traversal, no reverse graph, no
 *   symbol lookup, no textual search.
 * - evidence is exactly five keys: `declarationId`, `file`, `line`,
 *   `name`, and `kind`, mirroring REV-UNREFCALL-001. No message,
 *   severity, confidence, remediation, exported flag, initializer
 *   information, caller information, call counts, scope, or generic
 *   finding metadata is produced or implied.
 * - deterministic: findings sort by `declarationId` with UTF-16
 *   code-unit ordering — never `localeCompare`. The same context
 *   yields equivalent evidence regardless of source insertion order.
 * - readonly: `AnalysisContext`, V1 call edges, and declaration
 *   records are never mutated. Every violation object and every
 *   result array is newly allocated per evaluation; repeated
 *   evaluation yields equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - callbacks and function values whose invocation is not a
 *   represented CallExpression create no inbound edge.
 * - `.call`, `.apply`, `.bind`, `Reflect`, `eval`, and dynamic /
 *   non-literal member access are unrepresented.
 * - constructors / `new` invocations are not V1 call-graph nodes.
 * - top-level/module-scope calls have no represented caller and
 *   create no inbound edge for the callee from that call.
 * - external and package consumers are outside the analysis universe
 *   and contribute no inbound edge.
 * - accessors and interface method signatures are not V1
 *   declarations.
 * A finding therefore establishes only zero observed inbound V1 call
 * edges — never that a declaration is unused, dead, uncalled, or
 * unreachable.
 */

export interface RevUnrefcallprop001Violation {
  readonly declarationId: DeclarationId;
  readonly file: CanonicalPath;
  readonly line: number;
  readonly name: string;
  readonly kind: DeclarationRecord["kind"];
}

export interface RevUnrefcallprop001Options {
  readonly applicable?: boolean;
}

export type RevUnrefcallprop001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevUnrefcallprop001Violation[];
    };

const REPORTABLE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "property",
  "variable",
]);

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "tests";
}

function isReportableDeclaration(
  record: DeclarationRecord,
  participants: ReadonlySet<DeclarationId>,
): boolean {
  return (
    REPORTABLE_KINDS.has(record.kind) &&
    !isUnderTests(record.file) &&
    participants.has(record.id)
  );
}

function compareDeclarationIds(
  left: DeclarationId,
  right: DeclarationId,
): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

export function evaluateRevUnrefcallprop001(
  context: AnalysisContext,
  options?: RevUnrefcallprop001Options,
): RevUnrefcallprop001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const participants = new Set<DeclarationId>();
  const observedInbound = new Set<DeclarationId>();

  for (const edge of graph.edges) {
    participants.add(edge.callerId);
    participants.add(edge.calleeId);
    observedInbound.add(edge.calleeId);
  }

  const violations: RevUnrefcallprop001Violation[] = [];

  for (const record of context.allDeclarations()) {
    if (!isReportableDeclaration(record, participants)) {
      continue;
    }

    if (observedInbound.has(record.id)) {
      continue;
    }

    violations.push({
      declarationId: record.id,
      file: record.file,
      line: record.line,
      name: record.name,
      kind: record.kind,
    });
  }

  violations.sort((left, right) =>
    compareDeclarationIds(left.declarationId, right.declarationId),
  );

  return { evaluated: true, violations };
}
