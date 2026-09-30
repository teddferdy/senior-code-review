import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-SELFIMPORT-001 — Self-Import Review.
 *
 * Structural fact predicate over existing ModuleEdge facts: a supported
 * module edge whose resolved canonical target equals its resolved
 * canonical source.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO
 *   EVALUATION, which is neither pass nor fail. The rule is never
 *   universal.
 * - violation iff `edge.from === edge.to`. That is the complete
 *   predicate. The resolved endpoints are consumed, never recomputed: no
 *   `resolveImport()` call, no path normalization, no `.`/`..` handling,
 *   no extension comparison, no symlink resolution, no case folding, no
 *   rawSpecifier comparison, no source-text heuristic, no AST re-parse,
 *   no TypeChecker query, no filesystem check.
 * - the predicate is deliberately NOT `rawSpecifier`-based. The authored
 *   specifier and the resolved identity can diverge: `resolveImport`
 *   strips the extension on both sides and returns the first match in
 *   sorted canonical-path order, so `src/a.ts` importing `"./a"` (or
 *   even `"./a.js"`) resolves to a sibling `src/a.css` when one is
 *   supplied. Such an edge resolves elsewhere and is correctly not
 *   reported.
 * - `edge.to === null` is excluded implicitly: `CanonicalPath` is a
 *   `string`, so a string never strictly equals null. Consequently the
 *   `unresolved` and `external` classifications — both of which imply
 *   `to === null` upstream — cannot satisfy the predicate, and no
 *   explicit `kind` filtering is applied or needed.
 * - `kind` is NOT gated: both resolved classifications (`runtime` and
 *   `type-only`) participate. The rule observes a module-edge
 *   relationship, not runtime behaviour; it does not decide whether the
 *   self-import is executed, and consults no call graph.
 * - every supported `via` participates (import, export-from,
 *   export-star, re-export-namespace) with no per-form exception.
 * - supplied-universe semantics: a self-import is evaluated only when the
 *   upstream resolver already resolved the target back to the same
 *   supplied canonical source. A target omitted from the universe yields
 *   `to === null` and is reported by no one here. Completeness is never
 *   assumed, discovered, or checked.
 * - no scope filtering: every supplied canonical source participates
 *   exactly as supplied — tests, fixtures, generated-looking, nested
 *   package, node_modules-like, and monorepo-like paths alike.
 * - duplicates are preserved: exactly one violation per ModuleEdge. No
 *   deduplication by source, target, source+target, rawSpecifier, via,
 *   importedNames, or topology. Two identical statements remain two
 *   violations. The cycle analyzer's duplicate-collapse semantics are
 *   deliberately NOT reused.
 * - deliberate complementarity with REV-CYCLE-001: that rule ignores
 *   self-loops, this rule reports them. `analyzeImportCycles` is not
 *   called and REV-CYCLE-001 is not imported.
 * - evidence is exactly five keys. `target` is excluded because on every
 *   violation it is mathematically identical to `source` and therefore
 *   carries no information. No location, line, column, offset,
 *   severity, confidence, message, remediation, boundary, resolver
 *   explanation, or filesystem metadata is ever produced or implied.
 * - `importedNames` is preserved verbatim from the substrate and is
 *   always an explicitly present own property. The substrate omits the
 *   key entirely for `export-star`, which surfaces here as an explicit
 *   `undefined`. An empty array (`[]`, produced by both bare side-effect
 *   imports and namespace imports) is copied, never collapsed to
 *   undefined, and the two are not disambiguated — the substrate does
 *   not distinguish them. Substrate semantics are also not uniform
 *   across `via` (the import branch records source-side names, the
 *   export-from branch records exported names); both are preserved.
 * - readonly: `allModuleEdges()` returns a new array but shares the edge
 *   objects and their `importedNames` arrays, so nothing context-owned
 *   is ever written to. Every violation object is newly allocated and
 *   every `importedNames` array is defensively copied. No caching, no
 *   memoization, no module-level mutable state.
 * - deterministic: pure function of context facts + applicability,
 *   sorted by (source, rawSpecifier, via, kind, importedNames) using
 *   UTF-16 code-unit comparison — never `localeCompare`. `undefined`
 *   normalizes to `[]` for comparison only, which is inert because
 *   `via` is compared first and importedNames definedness is determined
 *   by `via`. Fully identical evidence records compare equal and retain
 *   their stable source-edge emission order.
 * - no judgment: the rule reports a structural fact only. It does not
 *   assert that a self-import is a bug, bad architecture, unnecessary,
 *   dangerous, incorrect, forbidden, circular, or a performance problem.
 * - unsupported by construction: dynamic `import()` and CommonJS
 *   `require()` emit no ModuleEdge at all, so they are unobservable here
 *   and are never called unresolved self-imports.
 */

/**
 * Evidence for one self-importing module edge. `target` is deliberately
 * absent: the predicate guarantees `edge.from === edge.to`, so a target
 * field would restate `source`.
 */
export interface RevSelfimport001Violation {
  readonly source: CanonicalPath;
  readonly rawSpecifier: string;
  readonly kind: ModuleEdge["kind"];
  readonly via: ModuleEdge["via"];
  readonly importedNames: readonly string[] | undefined;
}

/*
 * Minimum applicability boundary for the locked SPECIFIC-TARGET
 * policy. This is not a generic policy/config framework: it is a
 * single explicit declaration, owned by the caller, that
 * REV-SELFIMPORT-001 governs the reviewed project. Anything other than
 * an explicit `applicable: true` means the rule is not evaluated.
 */
export interface RevSelfimport001Options {
  readonly applicable?: boolean;
}

export type RevSelfimport001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevSelfimport001Violation[];
    };

function compareImportedNames(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  const leftNames = left ?? [];
  const rightNames = right ?? [];
  const shared = Math.min(leftNames.length, rightNames.length);

  for (let index = 0; index < shared; index += 1) {
    const a = leftNames[index] as string;
    const b = rightNames[index] as string;

    if (a !== b) {
      return a < b ? -1 : 1;
    }
  }

  if (leftNames.length !== rightNames.length) {
    return leftNames.length < rightNames.length ? -1 : 1;
  }

  return 0;
}

function compareViolations(
  left: RevSelfimport001Violation,
  right: RevSelfimport001Violation,
): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
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

  return compareImportedNames(left.importedNames, right.importedNames);
}

/**
 * Whether a module edge violates REV-SELFIMPORT-001: its resolved
 * canonical target equals its resolved canonical source. Consumes the
 * upstream classification only; no resolution is performed.
 */
export function isRevSelfimport001Violation(edge: ModuleEdge): boolean {
  return edge.from === edge.to;
}

export function evaluateRevSelfimport001(
  context: AnalysisContext,
  options?: RevSelfimport001Options,
): RevSelfimport001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevSelfimport001Violation[] = [];

  for (const edge of context.allModuleEdges()) {
    if (!isRevSelfimport001Violation(edge)) {
      continue;
    }

    violations.push({
      source: edge.from,
      rawSpecifier: edge.rawSpecifier,
      kind: edge.kind,
      via: edge.via,
      importedNames: edge.importedNames ? [...edge.importedNames] : undefined,
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
