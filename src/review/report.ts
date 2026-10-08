import type { RevRuleId } from "./registry.js";

/*
 * V1 review report contract — K21 §H/§I/§Q exact spec lock.
 *
 * The JSON renderer is the normative machine-readable representation.
 * Key declaration order below is the stable serialization order; it
 * must not be reordered. No timestamps, no durations, no random
 * fields, no environment-specific fields.
 *
 * Violation passthrough (locked): each rule's `violations` array holds
 * exactly the objects produced by its evaluator. The product layer
 * wraps the array but never mutates, normalizes, or extends its
 * members. No severity, confidence, priority, remediation, autofix, or
 * message fields are added.
 */

export const TOOL_NAME = "senior-code-reviewer" as const;

// Mirrors `version` in package.json. Hardcoded (rather than read from
// package.json at runtime) so report output cannot vary with module
// resolution or working directory; a product test asserts equality
// with package.json.
export const TOOL_VERSION = "0.1.0" as const;

export type V1ReviewStatus = "completed" | "completedWithErrors" | "inputError";

export type V1ReviewExitCode = 0 | 1 | 2;

export interface V1RuleReportEntry {
  readonly ruleId: RevRuleId;
  readonly evaluated: boolean;
  readonly violationCount: number;
  readonly violations: readonly unknown[];
  readonly error?: { readonly message: string };
}

export interface V1ReviewSummary {
  readonly rulesEvaluated: number;
  readonly rulesSkipped: number;
  readonly rulesErrored: number;
  readonly totalViolations: number;
}

export interface V1ReviewReport {
  readonly tool: { readonly name: typeof TOOL_NAME; readonly version: typeof TOOL_VERSION };
  readonly target: {
    readonly repositoryRoot: string;
    readonly fileCount: number;
    readonly files: readonly string[];
  };
  readonly status: V1ReviewStatus;
  readonly rules: readonly V1RuleReportEntry[];
  readonly summary: V1ReviewSummary;
  readonly error?: { readonly message: string };
}

export function getV1ReviewExitCode(report: V1ReviewReport): V1ReviewExitCode {
  if (report.status === "inputError" || report.status === "completedWithErrors") {
    return 2;
  }

  return report.summary.totalViolations > 0 ? 1 : 0;
}

export function renderV1ReviewJson(report: V1ReviewReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function violationLine(violation: unknown): string {
  return `  - ${JSON.stringify(violation)}`;
}

export function renderV1ReviewText(report: V1ReviewReport): string {
  const lines: string[] = [];

  lines.push(`${report.tool.name} ${report.tool.version}`);
  lines.push(`target: ${report.target.repositoryRoot}`);
  lines.push(`status: ${report.status}`);
  lines.push(`files: ${report.target.fileCount}`);

  for (const file of report.target.files) {
    lines.push(`  ${file}`);
  }

  lines.push(
    `rules: ${report.summary.rulesEvaluated} evaluated, ${report.summary.rulesSkipped} skipped, ${report.summary.rulesErrored} errored`,
  );

  for (const entry of report.rules) {
    if (entry.error !== undefined) {
      lines.push(`[${entry.ruleId}] error — ${entry.error.message}`);
      continue;
    }

    if (!entry.evaluated) {
      lines.push(`[${entry.ruleId}] skipped — not evaluated`);
      continue;
    }

    const plural = entry.violationCount === 1 ? "violation" : "violations";

    lines.push(`[${entry.ruleId}] evaluated — ${entry.violationCount} ${plural}`);

    for (const violation of entry.violations) {
      lines.push(violationLine(violation));
    }
  }

  if (report.error !== undefined) {
    lines.push(`error: ${report.error.message}`);
  }

  lines.push(
    `summary: ${report.summary.rulesEvaluated} evaluated, ${report.summary.rulesSkipped} skipped, ${report.summary.rulesErrored} errored, ${report.summary.totalViolations} total violations`,
  );

  return `${lines.join("\n")}\n`;
}
