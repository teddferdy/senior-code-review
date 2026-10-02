import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";

/*
 * REV-SPECINCON-001 — Inconsistent Module Specifiers.
 *
 * Spelling-consistency fact over existing ModuleEdge facts: one source
 * module references one resolved target module through two or more
 * distinct raw module specifier strings.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO EVALUATION,
 *   which is neither pass nor fail. The rule is never universal.
 * - universe: every resolved internal `(from, to)` pair with
 *   `to !== null`. No source/test path restriction exists: `src/**`,
 *   `tests/**`, staged test files, and documentation/config paths
 *   represented as module edges all participate as ordinary pair
 *   endpoints. Unresolved and external edges cannot participate
 *   because their `to` is null.
 * - all resolved kinds (`runtime`, `type-only`) and all four `via`
 *   values (`import`, `export-from`, `export-star`,
 *   `re-export-namespace`) participate equally. Neither kind nor via
 *   is part of grouping: an import leg and an export-from leg with
 *   differing raw specifiers qualify together.
 * - predicate: the pair's distinct `rawSpecifier` count is at least 2.
 *   Identical duplicate occurrences alone never qualify; exact
 *   six-field duplication remains owned by REV-DUPEDGE-001.
 * - self-pairs (`from === to`) are included with no special-casing:
 *   a module resolving to itself through two distinct raw specifiers
 *   qualifies. REV-SELFIMPORT-001 owns self-import existence; this
 *   rule independently owns the distinct-specifier observation.
 * - cardinality: exactly one finding per qualifying `(from, to)` pair
 *   — never per edge, per duplicate occurrence, per specifier, or per
 *   via.
 * - evidence is exactly three keys: `from`, `to`, and `specifiers`
 *   (distinct raw specifiers in UTF-16 ascending order, freshly
 *   allocated per finding). No message, severity, confidence,
 *   remediation, edge counts, kinds, vias, importedNames, metadata,
 *   or call information is produced or implied.
 * - deterministic: findings sort by (`from`, `to`) with UTF-16
 *   code-unit ordering — never `localeCompare`. The same context
 *   yields equivalent evidence regardless of source insertion order.
 * - readonly: `AnalysisContext` and `ModuleEdge` objects are never
 *   mutated. Every violation object, specifier array, and result array
 *   is newly allocated per evaluation; repeated evaluation yields
 *   equivalent independent results.
 *
 * Known limitations (documented here, never in violation data):
 * - path-mapped/aliased/bare specifiers resolving as external never
 *   form internal `to` targets and do not participate.
 * - unresolved edges do not participate.
 * - dynamic/non-literal `import()` produces no relevant module edge.
 * - `require()` produces no relevant module edge.
 * - the rule operates on raw spelling, not semantic equivalence: two
 *   different raw strings resolving to the same target are
 *   intentionally treated as inconsistent, without determining which
 *   spelling is preferred or whether either spelling is incorrect.
 * A finding therefore establishes only a raw-specifier spelling
 * inconsistency — never a duplicate dependency, a wrong import, a
 * broken import, a circular dependency, an unused module, or a
 * redundant dependency.
 */

export interface RevSpecincon001Violation {
  readonly from: CanonicalPath;
  readonly to: CanonicalPath;
  readonly specifiers: readonly string[];
}

export interface RevSpecincon001Options {
  readonly applicable?: boolean;
}

export type RevSpecincon001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | {
      readonly evaluated: true;
      readonly violations: RevSpecincon001Violation[];
    };

function pairKey(from: CanonicalPath, to: CanonicalPath): string {
  return `${from}\0${to}`;
}

function compareStrings(left: string, right: string): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

function compareViolations(
  left: RevSpecincon001Violation,
  right: RevSpecincon001Violation,
): number {
  if (left.from !== right.from) {
    return left.from < right.from ? -1 : 1;
  }

  if (left.to !== right.to) {
    return left.to < right.to ? -1 : 1;
  }

  return 0;
}

export function evaluateRevSpecincon001(
  context: AnalysisContext,
  options?: RevSpecincon001Options,
): RevSpecincon001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const specifiersByPair = new Map<string, Set<string>>();

  for (const edge of context.allModuleEdges()) {
    if (edge.to === null) {
      continue;
    }

    const key = pairKey(edge.from, edge.to);
    const specifiers = specifiersByPair.get(key);

    if (specifiers) {
      specifiers.add(edge.rawSpecifier);
    } else {
      specifiersByPair.set(key, new Set([edge.rawSpecifier]));
    }
  }

  const violations: RevSpecincon001Violation[] = [];

  for (const [key, specifiers] of specifiersByPair) {
    if (specifiers.size < 2) {
      continue;
    }

    const separator = key.indexOf("\0");
    const from = key.slice(0, separator) as CanonicalPath;
    const to = key.slice(separator + 1) as CanonicalPath;

    violations.push({
      from,
      to,
      specifiers: [...specifiers].sort(compareStrings),
    });
  }

  violations.sort(compareViolations);

  return { evaluated: true, violations };
}
