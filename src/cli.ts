#!/usr/bin/env node
import { runV1Review } from "./review/runner.js";
import {
  getV1ReviewExitCode,
  renderV1ReviewJson,
  renderV1ReviewText,
  type V1ReviewReport,
} from "./review/report.js";
import type { RevRuleId } from "./review/registry.js";

/*
 * Thin V1 CLI — K21 §J/§Q exact spec lock.
 *
 * Usage:
 *   senior-code-reviewer [--format json|text] [--output <path>] [--rule <id>...] <repositoryRoot>
 *
 * - repositoryRoot is required (exactly one positional argument).
 * - default format is `json`, independent of TTY state.
 * - default is all 19 rules; `--rule` is repeatable.
 * - selected rule IDs are deduplicated and lexically sorted before
 *   execution (registry order governs, never CLI argument order).
 * - stdout is the default destination; `--output` writes the rendered
 *   report to the supplied path instead (no implicit files inside the
 *   analyzed repository). `inputError` reports are always also echoed
 *   to stdout so failures are never silent.
 *
 * No process.argv coupling in the core: `runCli` is pure over its
 * argv input (besides the specified filesystem reads/writes) and is
 * directly testable; `main` is the only process-boundary function.
 */

export const V1_CLI_USAGE =
  "Usage: senior-code-reviewer [--format json|text] [--output <path>] [--rule <id>...] <repositoryRoot>";

export interface CliOptions {
  readonly repositoryRoot: string;
  readonly format: "json" | "text";
  readonly outputPath?: string;
  readonly enabledRules?: readonly RevRuleId[];
}

export interface CliResult {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

type ParseOutcome =
  | { readonly ok: true; readonly help: boolean; readonly options?: CliOptions }
  | { readonly ok: false; readonly message: string };

function takeValue(flag: string, value: string | undefined): string | undefined {
  if (value !== undefined && value !== "") {
    return value;
  }

  return undefined;
}

export function parseCliArgs(argv: readonly string[]): ParseOutcome {
  let format: "json" | "text" = "json";
  let outputPath: string | undefined;
  const ruleIds: string[] = [];
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;

    if (arg === "--help" || arg === "-h") {
      return { ok: true, help: true };
    }

    if (arg === "--format" || arg.startsWith("--format=")) {
      const raw =
        arg === "--format"
          ? takeValue(arg, argv[index + 1])
          : arg.slice("--format=".length);

      if (arg === "--format") {
        index += 1;
      }

      if (raw !== "json" && raw !== "text") {
        return {
          ok: false,
          message: `Unknown --format value: ${raw ?? "(missing)"}. Expected "json" or "text".\n${V1_CLI_USAGE}`,
        };
      }

      format = raw;
      continue;
    }

    if (arg === "--output" || arg.startsWith("--output=")) {
      const raw =
        arg === "--output"
          ? takeValue(arg, argv[index + 1])
          : arg.slice("--output=".length);

      if (arg === "--output") {
        index += 1;
      }

      if (raw === undefined) {
        return {
          ok: false,
          message: `Missing value for --output.\n${V1_CLI_USAGE}`,
        };
      }

      outputPath = raw;
      continue;
    }

    if (arg === "--rule" || arg.startsWith("--rule=")) {
      const raw =
        arg === "--rule"
          ? takeValue(arg, argv[index + 1])
          : arg.slice("--rule=".length);

      if (arg === "--rule") {
        index += 1;
      }

      if (raw === undefined) {
        return {
          ok: false,
          message: `Missing value for --rule.\n${V1_CLI_USAGE}`,
        };
      }

      ruleIds.push(raw);
      continue;
    }

    if (arg.startsWith("--")) {
      return {
        ok: false,
        message: `Unknown option: ${arg}.\n${V1_CLI_USAGE}`,
      };
    }

    positionals.push(arg);
  }

  if (positionals.length === 0) {
    return {
      ok: false,
      message: `Missing required <repositoryRoot> argument.\n${V1_CLI_USAGE}`,
    };
  }

  if (positionals.length > 1) {
    return {
      ok: false,
      message: `Expected exactly one <repositoryRoot> argument, received ${positionals.length}.\n${V1_CLI_USAGE}`,
    };
  }

  const sorted = [...new Set(ruleIds)].sort((left, right) =>
    left !== right ? (left < right ? -1 : 1) : 0,
  );

  return {
    ok: true,
    help: false,
    options: {
      repositoryRoot: positionals[0] as string,
      format,
      ...(outputPath !== undefined ? { outputPath } : {}),
      ...(sorted.length > 0
        ? { enabledRules: sorted as readonly RevRuleId[] }
        : {}),
    },
  };
}

function renderReport(report: V1ReviewReport, format: "json" | "text"): string {
  return format === "text"
    ? renderV1ReviewText(report)
    : renderV1ReviewJson(report);
}

export function runCli(argv: readonly string[]): CliResult {
  const parsed = parseCliArgs(argv);

  if (!parsed.ok) {
    return { exitCode: 2, stdout: "", stderr: `${parsed.message}\n` };
  }

  if (parsed.help || parsed.options === undefined) {
    return { exitCode: 0, stdout: `${V1_CLI_USAGE}\n`, stderr: "" };
  }

  const report = runV1Review(parsed.options.repositoryRoot, {
    format: parsed.options.format,
    ...(parsed.options.outputPath !== undefined
      ? { outputPath: parsed.options.outputPath }
      : {}),
    ...(parsed.options.enabledRules !== undefined
      ? { enabledRules: parsed.options.enabledRules }
      : {}),
  });

  const exitCode = getV1ReviewExitCode(report);

  if (report.status === "inputError" || parsed.options.outputPath === undefined) {
    return {
      exitCode,
      stdout: renderReport(report, parsed.options.format),
      stderr: "",
    };
  }

  return { exitCode, stdout: "", stderr: "" };
}

function main(): void {
  const result = runCli(process.argv.slice(2));

  if (result.stdout !== "") {
    process.stdout.write(result.stdout);
  }

  if (result.stderr !== "") {
    process.stderr.write(result.stderr);
  }

  process.exitCode = result.exitCode;
}

if (
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  main();
}
