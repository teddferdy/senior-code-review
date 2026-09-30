import type { AnalysisContext } from "./analysis-context.js";
import type { CanonicalPath } from "./declaration-ids.js";
import { analyzeImportCycles } from "./import-cycles.js";

/*
 * REV-CYCLE-001 — Internal Import-Cycle Review.
 *
 * Policy predicate over existing cycle facts: the analyzed source set
 * must not contain a closed internal module-dependency cycle.
 *
 * Locked semantics:
 * - SPECIFIC-TARGET applicability: evaluation happens only when the
 *   caller passes an explicit owner-authored applicability declaration
 *   (`{ applicable: true }`). Absent/false/not-true means NO
 *   EVALUATION, which is neither pass nor fail. The rule is never
 *   universal.
 * - violation iff `analyzeImportCycles(context)` returns a closed
 *   canonical-path cycle. One violation per distinct returned cycle.
 *   No other condition.
 * - cycle derivation is reused as-is: internal edges (`to !== null`,
 *   runtime and type-only alike); external and unresolved ignored;
 *   every resolved `via` participates; self-loops ignored for
 *   reporting; duplicates collapsed for traversal only. Alias records
 *   are not consulted.
 * - no scope filtering: all canonical sources as given participate;
 *   tests, fixtures, generated files, nested packages, and partial
 *   source sets are evaluated exactly as supplied.
 * - readonly: the derivation result is never mutated; each violation
 *   carries a defensive copy of the closed cycle path
 *   (`[A, B, ..., A]`, closing node retained) and no other evidence.
 * - deterministic: pure function of context facts + applicability;
 *   violations preserve the derivation order (already
 *   rotation-normalized, deduplicated, and sorted), re-sorted by
 *   cycle-path comparison for wrapper-level stability.
 */

export interface RevCycle001Violation {
  cyclePath: CanonicalPath[];
}

/*
 * Minimum applicability boundary for the locked SPECIFIC-TARGET
 * policy. This is not a generic policy/config framework: it is a
 * single explicit declaration, owned by the caller, that REV-CYCLE-001
 * governs the reviewed project. Anything other than an explicit
 * `applicable: true` means the rule is not evaluated.
 */
export interface RevCycle001Options {
  applicable?: boolean;
}

export type RevCycle001Result =
  | { readonly evaluated: false; readonly violations: readonly [] }
  | { readonly evaluated: true; readonly violations: RevCycle001Violation[] };

function compareCyclePaths(
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

export function evaluateRevCycle001(
  context: AnalysisContext,
  options?: RevCycle001Options,
): RevCycle001Result {
  if (options?.applicable !== true) {
    return { evaluated: false, violations: [] };
  }

  const violations: RevCycle001Violation[] = [];

  for (const cycle of analyzeImportCycles(context)) {
    violations.push({ cyclePath: [...cycle] });
  }

  violations.sort((left, right) =>
    compareCyclePaths(left.cyclePath, right.cyclePath),
  );

  return { evaluated: true, violations };
}
