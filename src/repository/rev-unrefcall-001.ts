import type { AnalysisContext } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationKind,
  DeclarationRecord,
} from "./declaration-ids.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-UNREFCALL-001 — Zero Observed Inbound V1 Call Edges.
 *
 * Inbound-degree fact over existing V1 call-graph facts: a reportable
 * callable declaration is reported when no V1 call edge names it as
 * callee.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - reportable universe: declarations whose kind is `function`,
 *   `method`, `overload`, or `objectMethod`, and whose file top segment
 *   is not `tests`. This matches the REV-CALLCYCLE-001 callable
 *   taxonomy. `class`, `interface`, `property`, and `variable`
 *   declarations are never reportees — including function-valued
 *   properties/variables, whose callable behavior is conditional and
 *   outside this rule.
 * - `DeclarationRecord.exported` is completely irrelevant to
 *   reportability. It is never read by this rule: methods and object
 *   methods are hardcoded `exported:false`, exported arrow-function
 *   variables are `exported:false`, `export { f }` re-export style never
 *   updates declaration state, and member-level visibility is not
 *   represented. The rule does not determine whether a callable is
 *   externally reachable or publicly consumed.
 * - inbound definition: a reportee has observed inbound usage iff some
 *   V1 call edge has `calleeId` equal to the reportee's id. No
 *   caller-side filtering exists: same-file, cross-file, production,
 *   test, and self-call (`callerId === calleeId`) callers all count.
 *   A self-call therefore protects its own declaration.
 * - overloads operate at individual DeclarationId granularity. The V1
 *   graph resolves each call to the checker-selected overload
 *   declaration, and that id alone is protected. Sibling overloads are
 *   evaluated independently; no family expansion via `record.overloads`
 *   or symbol records occurs.
 * - cardinality: inbound count `== 0` yields exactly one finding;
 *   inbound count `>= 1` yields none. A local set of observed callee
 *   ids is sufficient; no per-edge findings, no traversal, no reverse
 *   graph, no symbol lookup, no textual search.
 * - evidence is exactly five keys: `declarationId`, `file`, `line`,
 *   `name`, and `kind`. No message, severity, confidence, remediation,
 *   exported flag, call-site arrays, caller counts, scope, or generic
 *   finding metadata is produced or implied.
 * - deterministic: findings sort by `declarationId` with UTF-16
 *   code-unit ordering — never `localeCompare`. The same context yields
 *   equivalent evidence regardless of source insertion order.
 * - readonly: `AnalysisContext`, V1 call edges, and declaration
 *   records are never mutated. Every violation object and every result
 *   array is newly allocated per evaluation; repeated evaluation yields
 *   equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - top-level/module-scope calls have no represented caller and create
 *   no inbound edge.
 * - constructors / `new` invocations are not V1 call-graph nodes.
 * - callbacks and function values that are not represented
 *   CallExpressions create no inbound edge.
 * - `.call`, `.apply`, `.bind`, `Reflect`, `eval`, and dynamic /
 *   non-literal member access are unrepresented.
 * - external and package consumers are outside the analysis universe
 *   and contribute no inbound edge.
 * - accessors and interface method signatures are not V1 declarations.
 * - function-valued `property` / `variable` declarations are outside
 *   this rule's reportee universe.
 * A finding therefore establishes only zero observed inbound V1 call
 * edges — never that a callable is dead, unused, unreachable, or
 * globally unreferenced.
 */

export interface RevUnrefcall001Violation {
  readonly declarationId: DeclarationId;
  readonly file: CanonicalPath;
  readonly line: number;
  readonly name: string;
  readonly kind: DeclarationRecord["kind"];
}

export interface RevUnrefcall001Options {
  readonly applicable?: boolean;
}

export type RevUnrefcall001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevUnrefcall001Violation[];
    };

const REPORTABLE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "function",
  "method",
  "overload",
  "objectMethod",
]);

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "tests";
}

function isReportableDeclaration(record: DeclarationRecord): boolean {
  return REPORTABLE_KINDS.has(record.kind) && !isUnderTests(record.file);
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

export function evaluateRevUnrefcall001(
  context: AnalysisContext,
  options?: RevUnrefcall001Options,
): RevUnrefcall001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const observedInbound = new Set<DeclarationId>();

  for (const edge of graph.edges) {
    observedInbound.add(edge.calleeId);
  }

  const violations: RevUnrefcall001Violation[] = [];

  for (const record of context.allDeclarations()) {
    if (!isReportableDeclaration(record)) {
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
