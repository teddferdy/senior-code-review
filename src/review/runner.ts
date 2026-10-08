import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { AnalysisContext } from "../repository/analysis-context.js";
import { loadV1Sources } from "./loader.js";
import {
  V1_RULE_REGISTRY,
  isRevRuleId,
  type RevRuleId,
  type V1RegistryEntry,
} from "./registry.js";
import {
  TOOL_NAME,
  TOOL_VERSION,
  renderV1ReviewJson,
  renderV1ReviewText,
  type V1ReviewReport,
  type V1ReviewStatus,
  type V1RuleReportEntry,
} from "./report.js";

/*
 * V1 unified runner — K21 §G/§Q exact spec lock.
 *
 * Exactly one AnalysisContext per review, shared by every enabled
 * evaluator. Sequential synchronous evaluation in registry order
 * (selected rules run in registry order, never CLI argument order).
 * No parallelism. No cross-rule call-graph caching: each evaluator
 * rebuilds whatever derivations it needs, exactly as it does under
 * direct invocation — so runner results are identical to direct
 * evaluator results by construction.
 *
 * Applicability (locked): a full review passes `{ applicable: true }`
 * to every enabled evaluator. That call is the owner-authored
 * applicability declaration required by the SPECIFIC-TARGET
 * semantics. Disabled rules are not invoked and are reported as
 * `{ evaluated: false, violations: [] }` — the exact existing shape,
 * never reinterpreted as an error.
 *
 * Failure handling (locked): a throwing evaluator is caught per rule,
 * only its message is recorded (never the stack — stacks carry
 * absolute paths and machine-specific frames that would break
 * byte-identical output), remaining rules still execute, and the
 * overall status becomes `completedWithErrors` with a partial report.
 */

export type V1ReviewFormat = "json" | "text";

export interface RunV1ReviewOptions {
  readonly enabledRules?: readonly RevRuleId[];
  readonly format?: V1ReviewFormat;
  readonly outputPath?: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inputErrorReport(
  repositoryRoot: string,
  message: string,
): V1ReviewReport {
  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    target: { repositoryRoot, fileCount: 0, files: [] },
    status: "inputError",
    rules: [],
    summary: {
      rulesEvaluated: 0,
      rulesSkipped: 0,
      rulesErrored: 0,
      totalViolations: 0,
    },
    error: { message },
  };
}

function compareRuleIds(left: RevRuleId, right: RevRuleId): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

function renderReport(report: V1ReviewReport, format: V1ReviewFormat): string {
  return format === "text"
    ? renderV1ReviewText(report)
    : renderV1ReviewJson(report);
}

export function runV1ReviewWithEntries(
  repositoryRoot: string,
  entries: readonly V1RegistryEntry[],
  options?: RunV1ReviewOptions,
): V1ReviewReport {
  const format: V1ReviewFormat = options?.format ?? "json";

  if (format !== "json" && format !== "text") {
    return inputErrorReport(
      typeof repositoryRoot === "string" && repositoryRoot !== ""
        ? resolve(repositoryRoot)
        : "",
      `V1 review received an invalid format: ${String(format)}. Expected "json" or "text".`,
    );
  }

  if (
    typeof repositoryRoot !== "string" ||
    repositoryRoot === ""
  ) {
    return inputErrorReport("", "V1 review requires a non-empty repositoryRoot.");
  }

  const requested = options?.enabledRules;
  let enabledSet: ReadonlySet<RevRuleId> | undefined;

  if (requested !== undefined) {
    if (!Array.isArray(requested)) {
      return inputErrorReport(
        resolve(repositoryRoot),
        "V1 review received an invalid enabledRules option. Expected an array of rule IDs.",
      );
    }

    const selection = selectV1RuleIds(requested);

    if ("unknown" in selection) {
      return inputErrorReport(
        resolve(repositoryRoot),
        `V1 review received unknown rule IDs: ${selection.unknown.join(", ")}.`,
      );
    }

    enabledSet = new Set(selection.sorted);
  }

  let loaded: {
    readonly repositoryRoot: string;
    readonly files: readonly string[];
    readonly sources: Readonly<Record<string, string>>;
  };

  try {
    loaded = loadV1Sources(repositoryRoot);
  } catch (error) {
    return inputErrorReport(resolve(repositoryRoot), messageOf(error));
  }

  let context: AnalysisContext;

  try {
    context = new AnalysisContext({
      repositoryRoot: loaded.repositoryRoot,
      sources: { ...loaded.sources },
    });
  } catch (error) {
    return inputErrorReport(loaded.repositoryRoot, messageOf(error));
  }

  const status: { value: V1ReviewStatus } = { value: "completed" };
  const ruleEntries: V1RuleReportEntry[] = [];
  let rulesEvaluated = 0;
  let rulesSkipped = 0;
  let rulesErrored = 0;
  let totalViolations = 0;

  try {
    for (const entry of entries) {
      if (enabledSet !== undefined && !enabledSet.has(entry.ruleId)) {
        rulesSkipped += 1;
        ruleEntries.push({
          ruleId: entry.ruleId,
          evaluated: false,
          violationCount: 0,
          violations: [],
        });
        continue;
      }

      let evaluated = false;
      let violations: readonly unknown[] = [];
      let ruleError: { readonly message: string } | undefined;

      try {
        const result = entry.evaluate(context, { applicable: true });

        evaluated = result.evaluated;
        violations = result.violations;
      } catch (error) {
        evaluated = true;
        violations = [];
        ruleError = { message: messageOf(error) };
        rulesErrored += 1;
        status.value = "completedWithErrors";
      }

      if (ruleError === undefined) {
        if (evaluated) {
          rulesEvaluated += 1;
        } else {
          rulesSkipped += 1;
        }
      }

      totalViolations += violations.length;

      ruleEntries.push(
        ruleError === undefined
          ? {
              ruleId: entry.ruleId,
              evaluated,
              violationCount: violations.length,
              violations,
            }
          : {
              ruleId: entry.ruleId,
              evaluated,
              violationCount: 0,
              violations: [],
              error: ruleError,
            },
      );
    }
  } finally {
    context.dispose();
  }

  const report: V1ReviewReport = {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    target: {
      repositoryRoot: loaded.repositoryRoot,
      fileCount: loaded.files.length,
      files: [...loaded.files],
    },
    status: status.value,
    rules: ruleEntries,
    summary: {
      rulesEvaluated,
      rulesSkipped,
      rulesErrored,
      totalViolations,
    },
  };

  if (options?.outputPath !== undefined) {
    try {
      writeFileSync(options.outputPath, renderReport(report, format), "utf8");
    } catch (error) {
      return inputErrorReport(
        loaded.repositoryRoot,
        `V1 review cannot write output file "${options.outputPath}": ${messageOf(error)}`,
      );
    }
  }

  return report;
}

export function runV1Review(
  repositoryRoot: string,
  options?: RunV1ReviewOptions,
): V1ReviewReport {
  return runV1ReviewWithEntries(repositoryRoot, V1_RULE_REGISTRY, options);
}

export function selectV1RuleIds(
  requested: readonly string[],
): { readonly sorted: readonly RevRuleId[] } | { readonly unknown: readonly string[] } {
  const unknown = [...new Set(requested)].filter((id) => !isRevRuleId(id));

  unknown.sort();

  if (unknown.length > 0) {
    return { unknown };
  }

  const sorted = [...new Set(requested as RevRuleId[])].sort(compareRuleIds);

  return { sorted };
}
