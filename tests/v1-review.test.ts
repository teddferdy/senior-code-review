import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";
import { loadV1Sources } from "../src/review/loader.js";
import {
  V1_RULE_REGISTRY,
  type RevRuleId,
} from "../src/review/registry.js";
import {
  TOOL_VERSION,
  getV1ReviewExitCode,
  renderV1ReviewJson,
  renderV1ReviewText,
} from "../src/review/report.js";
import {
  runV1Review,
  runV1ReviewWithEntries,
} from "../src/review/runner.js";

function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "v1-review-"));

  for (const [relativePath, text] of Object.entries(files)) {
    const absolute = join(dir, relativePath);

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text, "utf8");
  }

  return dir;
}

function removeRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const VIOLATION_REPO: Record<string, string> = {
  "src/math.ts":
    "export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function helper(): number {\n  return 0;\n}\n",
  "src/main.ts":
    'import { add } from "./math";\n\nexport const result = add(1, 2);\n',
  "tests/math.test.ts":
    'import { helper } from "../src/math";\n\nexport function check(): number {\n  return helper();\n}\n',
};

describe("V1 unified execution", () => {
  it(
    "runs a full review of all 19 rules in registry order",
    () => {
      const dir = makeRepo(VIOLATION_REPO);

      try {
        const report = runV1Review(dir);

        expect(report.status).toBe("completed");
        expect(report.rules).toHaveLength(19);
        expect(report.rules.map((entry) => entry.ruleId)).toEqual(
          V1_RULE_REGISTRY.map((entry) => entry.ruleId),
        );
        expect(report.summary.rulesEvaluated).toBe(19);
        expect(report.summary.rulesSkipped).toBe(0);
        expect(report.summary.rulesErrored).toBe(0);
        expect(report.target.fileCount).toBe(3);
        expect([...report.target.files].sort()).toEqual([
          "src/main.ts",
          "src/math.ts",
          "tests/math.test.ts",
        ]);
        expect(
          report.summary.totalViolations,
        ).toBe(
          report.rules.reduce(
            (sum, entry) => sum + entry.violationCount,
            0,
          ),
        );
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "evaluates only selected rules and reports the rest as skipped without invoking them",
    () => {
      const dir = makeRepo(VIOLATION_REPO);
      const invoked: RevRuleId[] = [];
      const entries = V1_RULE_REGISTRY.map((entry) => ({
        ruleId: entry.ruleId,
        evaluate: (
          context: Parameters<typeof entry.evaluate>[0],
          options?: { applicable?: boolean },
        ) => {
          invoked.push(entry.ruleId);

          return entry.evaluate(context, options);
        },
      }));

      try {
        const report = runV1ReviewWithEntries(dir, entries, {
          enabledRules: ["REV-UNRES-001", "REV-CYCLE-001"],
        });

        expect(report.status).toBe("completed");
        expect(invoked).toEqual(["REV-CYCLE-001", "REV-UNRES-001"]);
        expect(report.summary.rulesEvaluated).toBe(2);
        expect(report.summary.rulesSkipped).toBe(17);

        for (const entry of report.rules) {
          if (
            entry.ruleId === "REV-CYCLE-001" ||
            entry.ruleId === "REV-UNRES-001"
          ) {
            expect(entry.evaluated).toBe(true);
          } else {
            expect(entry.evaluated).toBe(false);
            expect(entry.violationCount).toBe(0);
            expect(entry.violations).toEqual([]);
            expect(entry.error).toBeUndefined();
          }
        }
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "shares exactly one context across rules and executes sequentially in registry order",
    () => {
      const dir = makeRepo(VIOLATION_REPO);
      const seen: { ruleId: RevRuleId; context: unknown }[] = [];
      const entries = V1_RULE_REGISTRY.map((entry) => ({
        ruleId: entry.ruleId,
        evaluate: (
          context: Parameters<typeof entry.evaluate>[0],
          options?: { applicable?: boolean },
        ) => {
          seen.push({ ruleId: entry.ruleId, context });

          return entry.evaluate(context, options);
        },
      }));

      try {
        const report = runV1ReviewWithEntries(dir, entries);

        expect(report.status).toBe("completed");

        const contexts = new Set(seen.map((item) => item.context));

        expect(contexts.size).toBe(1);
        expect(seen.map((item) => item.ruleId)).toEqual(
          V1_RULE_REGISTRY.map((entry) => entry.ruleId),
        );
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "preserves every evaluator's violations exactly (findings fidelity)",
    () => {
      const dir = makeRepo(VIOLATION_REPO);

      try {
        const loaded = loadV1Sources(dir);
        const context = new AnalysisContext({
          repositoryRoot: loaded.repositoryRoot,
          sources: { ...loaded.sources },
        });

        try {
          const report = runV1Review(dir);

          expect(report.rules).toHaveLength(19);

          for (const registryEntry of V1_RULE_REGISTRY) {
            const direct = registryEntry.evaluate(context, {
              applicable: true,
            });
            const viaRunner = report.rules.find(
              (entry) => entry.ruleId === registryEntry.ruleId,
            );

            expect(viaRunner).toBeDefined();
            expect(viaRunner?.evaluated).toBe(direct.evaluated);
            expect(viaRunner?.violations).toEqual([...direct.violations]);
            expect(viaRunner?.violationCount).toBe(direct.violations.length);
          }
        } finally {
          context.dispose();
        }
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "produces byte-identical JSON across repeated runs",
    () => {
      const dir = makeRepo(VIOLATION_REPO);

      try {
        const first = renderV1ReviewJson(runV1Review(dir));
        const second = renderV1ReviewJson(runV1Review(dir));

        expect(second).toBe(first);

        const textFirst = renderV1ReviewText(runV1Review(dir));
        const textSecond = renderV1ReviewText(runV1Review(dir));

        expect(textSecond).toBe(textFirst);
      } finally {
        removeRepo(dir);
      }
    },
    120000,
  );

  it(
    "captures only the error message when an evaluator throws and continues with a partial report",
    () => {
      const dir = makeRepo(VIOLATION_REPO);
      const entries = V1_RULE_REGISTRY.map((entry) =>
        entry.ruleId === "REV-ARCH-001"
          ? {
              ruleId: entry.ruleId,
              evaluate: () => {
                throw new Error("boom");
              },
            }
          : entry,
      );

      try {
        const report = runV1ReviewWithEntries(dir, entries);

        expect(report.status).toBe("completedWithErrors");
        expect(report.summary.rulesErrored).toBe(1);
        expect(report.summary.rulesEvaluated).toBe(18);

        const failed = report.rules.find(
          (entry) => entry.ruleId === "REV-ARCH-001",
        );

        expect(failed?.error).toEqual({ message: "boom" });
        expect(failed?.violations).toEqual([]);
        expect(failed?.violationCount).toBe(0);
        expect(getV1ReviewExitCode(report)).toBe(2);

        const later = report.rules.find(
          (entry) => entry.ruleId === "REV-UNRES-001",
        );

        expect(later?.error).toBeUndefined();
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "maps exit codes: 0 clean, 1 findings, 2 input errors",
    () => {
      const cleanDir = makeRepo({});
      const violationDir = makeRepo({
        "src/lonely.ts": "export const lonely = 1;\n",
      });

      try {
        const clean = runV1Review(cleanDir);

        expect(clean.status).toBe("completed");
        expect(clean.summary.totalViolations).toBe(0);
        expect(getV1ReviewExitCode(clean)).toBe(0);

        const findings = runV1Review(violationDir);

        expect(findings.status).toBe("completed");
        expect(findings.summary.totalViolations).toBeGreaterThan(0);
        expect(getV1ReviewExitCode(findings)).toBe(1);

        const missing = runV1Review(join(cleanDir, "does-not-exist"));

        expect(missing.status).toBe("inputError");
        expect(missing.rules).toEqual([]);
        expect(missing.error?.message).toContain("does not exist");
        expect(getV1ReviewExitCode(missing)).toBe(2);

        const unknownRule = runV1Review(cleanDir, {
          enabledRules: ["REV-NOPE-001" as RevRuleId],
        });

        expect(unknownRule.status).toBe("inputError");
        expect(unknownRule.error?.message).toContain("REV-NOPE-001");
        expect(getV1ReviewExitCode(unknownRule)).toBe(2);
      } finally {
        removeRepo(cleanDir);
        removeRepo(violationDir);
      }
    },
    120000,
  );

  it(
    "rejects a file path as repository root",
    () => {
      const dir = makeRepo({ "src/a.ts": "export const a = 1;\n" });

      try {
        const report = runV1Review(join(dir, "src/a.ts"));

        expect(report.status).toBe("inputError");
        expect(getV1ReviewExitCode(report)).toBe(2);
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "writes the rendered report to an explicit output path",
    () => {
      const dir = makeRepo({ "src/a.ts": "export const a = 1;\n" });
      const outputPath = join(dir, "report.json");

      try {
        const report = runV1Review(dir, {
          format: "json",
          outputPath,
        });

        expect(report.status).toBe("completed");

        const written = readFileSync(outputPath, "utf8");

        expect(written).toBe(renderV1ReviewJson(report));
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it("reports inputError when the output file cannot be written", () => {
    const dir = makeRepo({ "src/a.ts": "export const a = 1;\n" });

    try {
      const report = runV1Review(dir, {
        outputPath: join(dir, "no-such-dir", "report.json"),
      });

      expect(report.status).toBe("inputError");
      expect(report.error?.message).toContain("cannot write output file");
      expect(getV1ReviewExitCode(report)).toBe(2);
    } finally {
      removeRepo(dir);
    }
  }, 60000);

  it("keeps TOOL_VERSION equal to package.json version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    expect(TOOL_VERSION).toBe(pkg.version);
  });

  it("contains no nondeterministic primitives in product code", () => {
    const files = [
      "../src/review/registry.ts",
      "../src/review/loader.ts",
      "../src/review/report.ts",
      "../src/review/runner.ts",
      "../src/cli.ts",
      "../src/index.ts",
    ];

    for (const file of files) {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");

      expect(text).not.toContain("localeCompare");
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("Math.random");
      expect(text).not.toContain("randomUUID");
    }
  });
});
