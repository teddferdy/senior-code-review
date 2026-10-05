import type { AnalysisContext } from "./analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationKind,
  DeclarationRecord,
} from "./declaration-ids.js";
import { buildV1CallGraph } from "./v1-call-graph.js";

/*
 * REV-TESTONLYCALL-001 — Test-Only Observed Call Review.
 *
 * Caller-origin fact over existing V1 call-graph facts: a reportable
 * production callable declaration is reported when it has at least one
 * observed inbound V1 call edge and every resolvable inbound caller
 * declaration resides under root-anchored `tests/**`.
 *
 * Reviewer question: which production callables have observed inbound
 * V1 calls only from test callers and no observed production callers?
 *
 * Semantic boundary: this rule reports an observed V1 call-graph
 * property. It does NOT claim complete runtime coverage, complete
 * caller discovery, absence of dead code, production non-usage, or
 * knowledge of external consumers.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - reportable universe: declarations whose kind is `function`,
 *   `method`, `overload`, or `objectMethod`, and whose file top segment
 *   is not `tests`. This matches the REV-UNREFCALL-001 callable
 *   taxonomy. `class`, `interface`, `property`, and `variable`
 *   declarations are never reportees. Property/variable observation
 *   belongs to REV-UNREFCALLPROP-001.
 * - `DeclarationRecord.exported` is completely irrelevant to
 *   reportability and is never read, mirroring REV-UNREFCALL-001.
 * - test partition: a reportee has test-only observation iff its V1
 *   inbound edge set is non-empty and every resolvable inbound caller
 *   declaration has a file whose top path segment is exactly `tests`.
 *   The filename-based `file-classifier.ts` heuristic is never
 *   consulted, mirroring every existing call-observation rule.
 * - ownership partition over the eligible callable universe: inbound
 *   count `== 0` is owned by REV-UNREFCALL-001 and never reported here;
 *   inbound count `>= 1` with all resolvable callers under `tests/**`
 *   is reported here; inbound count `>= 1` with any non-test caller
 *   (including a self-call, whose caller shares the reportee's
 *   non-test file) is clean. A partition with edges but zero
 *   resolvable callers is defensively skipped: an empty caller list
 *   establishes no test-only observation.
 * - caller identity is consumed, never derived: each V1 edge's
 *   `callerId` is resolved through the existing
 *   `context.declarationOf()` table exactly as REV-CALLCHAINLESS-001
 *   does. An unresolvable caller is ignored for partitioning (defensive
 *   only; V1 construction emits table-backed caller IDs). No binding
 *   inference, no import analysis, no mechanism labeling occurs here.
 * - overloads operate at individual DeclarationId granularity. The V1
 *   graph resolves each call to the checker-selected overload
 *   declaration, and that id alone is evaluated. Sibling overloads are
 *   evaluated independently; no family expansion via `record.overloads`
 *   or symbol records occurs.
 * - cardinality: one finding per test-only-observed reportee. The
 *   `testCallers` set holds the distinct caller DeclarationIds that
 *   establish the observation.
 * - evidence is exactly six keys: `declarationId`, `file`, `line`,
 *   `name`, `kind`, and `testCallers` (distinct caller DeclarationIds,
 *   UTF-16 code-unit ascending, freshly allocated). No message,
 *   severity, confidence, remediation, count, productionCallerCount,
 *   threshold, or generic finding metadata is produced or implied.
 * - deterministic: findings sort by `declarationId` with UTF-16
 *   code-unit ordering — never `localeCompare`. Caller sets are
 *   deduplicated before sorting, so Map/Set insertion order never
 *   reaches the output. The same context yields equivalent evidence
 *   regardless of source insertion order.
 * - readonly: `AnalysisContext`, V1 call edges, and declaration
 *   records are never mutated. Every violation object, every
 *   `testCallers` array, and every result object is newly allocated per
 *   evaluation; repeated evaluation yields equivalent independent
 *   results.
 * - no configuration surface: no numeric options, no thresholds, no
 *   allow-lists, no path configuration, no severity configuration.
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
 * - unresolved overload candidates may produce no V1 edge.
 * - a caller staged at `src/**.test.ts` is literally under `src/**`
 *   and therefore counts as a production caller under the locked
 *   top-segment convention.
 * A finding therefore establishes only observed inbound V1 calls from
 * test callers — never that a callable is dead, unused, unreachable,
 * or unexercised in production.
 */

export type RevTestonlycall001Kind =
  | "function"
  | "method"
  | "overload"
  | "objectMethod";

export interface RevTestonlycall001Violation {
  readonly declarationId: DeclarationId;
  readonly file: CanonicalPath;
  readonly line: number;
  readonly name: string;
  readonly kind: RevTestonlycall001Kind;
  readonly testCallers: readonly DeclarationId[];
}

export interface RevTestonlycall001Options {
  readonly applicable?: boolean;
}

export type RevTestonlycall001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevTestonlycall001Violation[];
    };

const REPORTABLE_KINDS: ReadonlySet<DeclarationKind> = new Set([
  "function",
  "method",
  "overload",
  "objectMethod",
]);

function isReportableKind(
  kind: DeclarationKind,
): kind is RevTestonlycall001Kind {
  return REPORTABLE_KINDS.has(kind);
}

function pathSegments(canonicalPath: CanonicalPath): readonly string[] {
  return canonicalPath.split("/");
}

function isUnderTests(canonicalPath: CanonicalPath): boolean {
  return pathSegments(canonicalPath)[0] === "tests";
}

function isReportableDeclaration(
  record: DeclarationRecord,
): record is DeclarationRecord & { kind: RevTestonlycall001Kind } {
  return isReportableKind(record.kind) && !isUnderTests(record.file);
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

interface CallerPartition {
  readonly testCallers: Set<DeclarationId>;
  hasProductionCaller: boolean;
}

export function evaluateRevTestonlycall001(
  context: AnalysisContext,
  options?: RevTestonlycall001Options,
): RevTestonlycall001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const graph = buildV1CallGraph(context);
  const partitions = new Map<DeclarationId, CallerPartition>();

  for (const edge of graph.edges) {
    const caller = context.declarationOf(edge.callerId);

    if (!caller) {
      continue;
    }

    let partition = partitions.get(edge.calleeId);

    if (!partition) {
      partition = { testCallers: new Set(), hasProductionCaller: false };
      partitions.set(edge.calleeId, partition);
    }

    if (isUnderTests(caller.file)) {
      partition.testCallers.add(edge.callerId);
    } else {
      partition.hasProductionCaller = true;
    }
  }

  const violations: RevTestonlycall001Violation[] = [];

  for (const record of context.allDeclarations()) {
    if (!isReportableDeclaration(record)) {
      continue;
    }

    const partition = partitions.get(record.id);

    if (!partition) {
      continue;
    }

    if (partition.hasProductionCaller) {
      continue;
    }

    if (partition.testCallers.size === 0) {
      continue;
    }

    const testCallers = [...partition.testCallers].sort(
      compareDeclarationIds,
    );

    violations.push({
      declarationId: record.id,
      file: record.file,
      line: record.line,
      name: record.name,
      kind: record.kind,
      testCallers,
    });
  }

  violations.sort((left, right) =>
    compareDeclarationIds(left.declarationId, right.declarationId),
  );

  return { evaluated: true, violations };
}
