import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevUnrefcallprop001Result } from "../src/repository/rev-unrefcallprop-001.js";
import { evaluateRevUnrefcallprop001 } from "../src/repository/rev-unrefcallprop-001.js";
import { evaluateRevUnrefcall001 } from "../src/repository/rev-unrefcall-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevUnrefcallprop001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevUnrefcallprop001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const CALLER_ONLY_VARIABLE = {
  "src/a.ts":
    'import { helper } from "./b";\nexport const runner = (): void => {\n  helper();\n};\n',
  "src/b.ts": "export function helper(): void {}\n",
};

describe("REV-UNREFCALLPROP-001 function-valued zero-inbound properties and variables", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when options are omitted",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE);

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "02 produces no evaluation when applicability is explicitly false",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: false,
        });

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "03 produces no evaluation for truthy non-boolean applicability values",
      () => {
        const values: unknown[] = [1, "true", "yes", {}, []];

        for (const value of values) {
          const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
            applicable: value as boolean,
          });

          try {
            expect(result).toEqual({ evaluated: false, violations: [] });
          } finally {
            finish(context);
          }
        }
      },
      30000,
    );

    it(
      "04 evaluates when applicability is exactly true",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("positive cases", () => {
    it(
      "05 reports a zero-inbound function-valued arrow variable",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.kind).toBe("variable");
          expect(violation?.name).toBe("runner");
          expect(violation?.file).toBe("src/a.ts");
          expect(violation?.line).toBe(2);
          expect(typeof violation?.declarationId).toBe("string");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports a zero-inbound function-expression property",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport class Svc {\n  handler = function (): void {\n    helper();\n  };\n}\n',
            "src/b.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.kind).toBe("property");
          expect(violation?.name).toBe("handler");
          expect(violation?.file).toBe("src/a.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports a parenthesized arrow initializer",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport const p = (((): void => {\n  helper();\n}));\n',
            "src/b.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.kind).toBe("variable");
          expect(violation?.name).toBe("p");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports an as-wrapped arrow initializer",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport const q = (((): void => {\n  helper();\n}) as () => void);\n',
            "src/b.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.kind).toBe("variable");
          expect(violation?.name).toBe("q");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports a caller-only variable through endpoint participation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport const relay = (): void => {\n  helper();\n};\nexport function trigger(): void {\n  helper();\n}\n',
            "src/b.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // relay participates as a V1 caller (hence function-valued)
          // but never as a callee: the endpoint proxy, not initializer
          // reinspection, establishes eligibility.
          const names = result.violations.map(
            (violation) => violation.name,
          );
          expect(names).toContain("relay");
          for (const violation of result.violations) {
            expect(violation.kind).toBe("variable");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("negative cases", () => {
    it(
      "10 excludes a called variable",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const cb = (): void => {};\nexport function run(): void {\n  cb();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 excludes declarations outside V1 endpoint participation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const lonely = (): void => {};\nexport const plain = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // No V1 edges exist, so neither declaration participates:
          // both are outside the reportable universe, including the
          // function-valued one. This is the locked limitation.
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 excludes zero-inbound methods owned by UNREFCALL-001",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export class C {\n  m(): void {}\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 excludes zero-inbound functions owned by UNREFCALL-001",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function f(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 excludes overloads owned by UNREFCALL-001",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function pick(input: string): void;\nexport function pick(input: number): void;\nexport function pick(input: unknown): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 excludes a caller-only object method owned by UNREFCALL-001",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport const svc = {\n  run(): void {\n    helper();\n  },\n};\n',
            "src/b.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // svc.run participates as caller but its kind is
          // objectMethod: UNREFCALL-001 territory, never reported here.
          // The svc variable itself never participates.
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 excludes a participating variable under tests",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts": "export function helper(): void {}\n",
            "tests/h.ts":
              'import { helper } from "../src/b";\nexport const runner = (): void => {\n  helper();\n};\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 counts an inbound test caller as observed usage",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./b";\nexport const runner = (): void => {\n  helper();\n};\n',
            "src/b.ts": "export function helper(): void {}\n",
            "tests/c.ts":
              'import { runner } from "../src/a";\nexport function check(): void {\n  runner();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 counts an inbound production caller as observed usage",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export const cb = (): void => {};\nexport function run(): void {\n  cb();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 counts a self-call as observed usage",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const tick = (n: number): void => {\n  if (n > 0) {\n    tick(n - 1);\n  }\n};\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism and integrity", () => {
    it(
      "20 sorts multiple findings by declaration ID in UTF-16 order",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              'import { helper } from "./helper";\nexport const second = (): void => {\n  helper();\n};\n',
            "src/a.ts":
              'import { helper } from "./helper";\nexport const first = (): void => {\n  helper();\n};\n',
            "src/helper.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const ids = result.violations.map(
            (violation) => violation.declarationId,
          );
          expect([...ids].sort()).toEqual(ids);
          expect(
            result.violations.map((violation) => violation.file),
          ).toEqual(["src/a.ts", "src/b.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 produces identical output for reversed fixture insertion order",
      () => {
        const first = evaluate(CALLER_ONLY_VARIABLE, { applicable: true });
        const reversed = evaluate(
          {
            "src/b.ts": CALLER_ONLY_VARIABLE["src/b.ts"],
            "src/a.ts": CALLER_ONLY_VARIABLE["src/a.ts"],
          },
          { applicable: true },
        );

        try {
          expect(reversed.result).toEqual(first.result);
        } finally {
          finish(first.context);
          finish(reversed.context);
        }
      },
      30000,
    );

    it(
      "22 produces deep-equal output on repeated evaluation",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevUnrefcallprop001(context, {
            applicable: true,
          });
          expect(again).toEqual(result);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "23 returns fresh violation objects between evaluations",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevUnrefcallprop001(context, {
            applicable: true,
          });
          expect(again.evaluated).toBe(true);
          if (result.evaluated && again.evaluated) {
            expect(again.violations).not.toBe(result.violations);
            expect(again.violations[0]).not.toBe(result.violations[0]);
            expect(again.violations).toEqual(result.violations);
          } else {
            throw new Error("expected both evaluations to run");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 leaves context-owned tables unchanged",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const before = JSON.stringify({
            paths: context.canonicalPaths,
            edges: context.allModuleEdges(),
            declarations: context.allDeclarations(),
          });
          evaluateRevUnrefcallprop001(context, { applicable: true });
          const after = JSON.stringify({
            paths: context.canonicalPaths,
            edges: context.allModuleEdges(),
            declarations: context.allDeclarations(),
          });
          expect(after).toBe(before);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 emits exactly the locked evidence keys",
      () => {
        const { context, result } = evaluate(CALLER_ONLY_VARIABLE, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(Object.keys(violation ?? {}).sort()).toEqual([
            "declarationId",
            "file",
            "kind",
            "line",
            "name",
          ]);
          const serialized = JSON.stringify(violation);
          for (const forbidden of [
            "severity",
            "message",
            "confidence",
            "remediation",
            "exported",
            "initializer",
            "caller",
            "callee",
          ]) {
            expect(serialized).not.toContain(forbidden);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 splits ownership with REV-UNREFCALL-001 by kind with no overlap",
      () => {
        const sources = {
          "src/a.ts":
            'import { helper } from "./b";\nexport const runner = (): void => {\n  helper();\n};\nexport function idle(): void {}\n',
          "src/b.ts": "export function helper(): void {}\n",
        };
        const { context, result } = evaluate(sources, { applicable: true });

        try {
          expect(result.evaluated).toBe(true);
          // PROP owns only the caller-only variable; the zero-inbound
          // function belongs to UNREFCALL-001.
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("variable");
          expect(result.violations[0]?.name).toBe("runner");
          const sibling = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          expect(sibling.evaluated).toBe(true);
          if (sibling.evaluated) {
            expect(sibling.violations).toHaveLength(1);
            expect(sibling.violations[0]?.kind).toBe("function");
            expect(sibling.violations[0]?.name).toBe("idle");
          } else {
            throw new Error("expected sibling evaluation to run");
          }
          const propIds = new Set(
            result.violations.map((violation) => violation.declarationId),
          );
          if (sibling.evaluated) {
            for (const violation of sibling.violations) {
              expect(propIds.has(violation.declarationId)).toBe(false);
            }
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
