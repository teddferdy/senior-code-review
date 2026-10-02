import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevNoout001Result } from "../src/repository/rev-noout-001.js";
import { evaluateRevNoout001 } from "../src/repository/rev-noout-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevNoout001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevNoout001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const LONELY = {
  "src/lonely.ts": "export const lonely = 1;\n",
};

describe("REV-NOOUT-001 zero outbound module edges", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(LONELY);

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
        const { context, result } = evaluate(LONELY, { applicable: false });

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "03 evaluates a zero-outbound module when applicable is true",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result).toEqual({
            evaluated: true,
            violations: [{ module: "src/lonely.ts", scope: "src/**" }],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "04 produces no evaluation for truthy non-boolean applicability",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(LONELY, {
            applicable: value as unknown as boolean,
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
  });

  describe("positive", () => {
    it(
      "05 reports one src module with zero outbound edges",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result.violations).toEqual([
            { module: "src/lonely.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports multiple zero-outbound modules in UTF-16 order",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts": "export const b = 1;\n",
            "src/a.ts":
              'import { b } from "./b";\nexport const a = 1;\n',
            "src/c.ts": "export const c = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
            { module: "src/c.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports a nested src module with zero outbound edges",
      () => {
        const { context, result } = evaluate(
          {
            "src/a/b/c.ts": "export const c = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/a/b/c.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 inbound edges do not suppress a zero-outbound report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export const a = 1;\n",
            "src/b.ts": 'import { a } from "./a";\nexport const b = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/a.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 unresolved-only outbound still reports the module",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { ghost } from "./missing";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/a.ts", scope: "src/**" },
          ]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/a.ts");
          expect(edge?.kind).toBe("unresolved");
          expect(edge?.to).toBeNull();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 external-only outbound still reports the module",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "some-package";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/a.ts", scope: "src/**" },
          ]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/a.ts");
          expect(edge?.kind).toBe("external");
          expect(edge?.to).toBeNull();
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("negative", () => {
    it(
      "11 a runtime outbound edge suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 a type-only outbound edge suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import type { T } from "./b";\n',
            "src/b.ts": "export interface T { v: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 an export-from outbound edge suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'export { b } from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 an export-star outbound edge suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'export * from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 a re-export-namespace outbound edge suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'export * as ns from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 a self-import suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "./a";\nexport const a = 1;\n',
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
      "17 src to tests counts as outbound under Option A",
      () => {
        const { context, result } = evaluate(
          {
            "src/foo.ts": 'import { x } from "../tests/bar";\n',
            "tests/bar.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/foo.ts");
          expect(edge?.to).toBe("tests/bar.ts");
          expect(edge?.kind).toBe("runtime");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 src to another represented non-src path counts as outbound",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { tool } from "../tools/gen";\n',
            "tools/gen.ts": "export const tool = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/a.ts");
          expect(edge?.to).toBe("tools/gen.ts");
          expect(edge?.kind).toBe("runtime");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 src to src counts as outbound",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = 1;\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 multiple edges to the same target suppress the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport { b as b2 } from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 mixed runtime and type-only outbound suppresses the report",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport type { T } from "./b";\n',
            "src/b.ts":
              "export const b = 1;\nexport interface T { v: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 duplicate qualifying edges suppress the report once",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { b as b2 } from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("ordering", () => {
    it(
      "23 digit-width paths prove ordinary UTF-16 comparison",
      () => {
        const { context, result } = evaluate(
          {
            "src/a2.ts": "export const a2 = 1;\n",
            "src/a10.ts": "export const a10 = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.module)).toEqual([
            "src/a10.ts",
            "src/a2.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 case ordering follows UTF-16 code units",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export const a = 1;\n",
            "src/B.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.module)).toEqual([
            "src/B.ts",
            "src/a.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "25 shuffled source insertion order produces identical results",
      () => {
        const forward = {
          "src/a.ts": 'import { b } from "./b";\n',
          "src/b.ts": "export const b = 1;\n",
          "src/c.ts": "export const c = 1;\n",
        };
        const reversed = {
          "src/c.ts": "export const c = 1;\n",
          "src/b.ts": "export const b = 1;\n",
          "src/a.ts": 'import { b } from "./b";\n',
        };
        const first = evaluate(forward, { applicable: true });
        const second = evaluate(reversed, { applicable: true });

        try {
          expect(second.result).toEqual(first.result);
          expect(first.result.violations).toEqual([
            { module: "src/b.ts", scope: "src/**" },
            { module: "src/c.ts", scope: "src/**" },
          ]);
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );

    it(
      "26 repeated evaluation returns deep-equal results",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevNoout001(context, { applicable: true });
          const second = evaluateRevNoout001(context, { applicable: true });
          expect(second).toEqual(first);
          expect(first.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("safety", () => {
    it(
      "27 evaluation does not mutate context state",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          const pathsBefore = [...context.canonicalPaths];
          const edgesBefore = context.allModuleEdges();
          expect(result.violations).toHaveLength(1);
          expect([...context.canonicalPaths]).toEqual(pathsBefore);
          expect(context.allModuleEdges()).toEqual(edgesBefore);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 canonical paths remain unchanged",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result.violations).toHaveLength(1);
          expect([...context.canonicalPaths]).toEqual(["src/lonely.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 edge arrays remain unchanged",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          const edgesBefore = context.allModuleEdges();
          expect(result.violations).toHaveLength(1);
          expect(context.allModuleEdges()).toEqual(edgesBefore);
          expect(context.allModuleEdges()).toHaveLength(
            edgesBefore.length,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 edge objects remain unchanged",
      () => {
        const sources = {
          "src/a.ts": 'import { b } from "./b";\n',
          "src/b.ts": "export const b = 1;\n",
        };
        const { context, result } = evaluate(sources, { applicable: true });

        try {
          const edgesBefore = context.allModuleEdges();
          expect(result.violations).toHaveLength(1);
          const edgesAfter = context.allModuleEdges();
          expect(edgesAfter).toEqual(edgesBefore);
          for (const [index, edge] of edgesAfter.entries()) {
            expect(edge).toBe(edgesBefore[index]);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 repeated evaluation returns independently allocated violations",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevNoout001(context, { applicable: true });
          const second = evaluateRevNoout001(context, { applicable: true });
          expect(second).not.toBe(first);
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations[0]).not.toBe(first.violations[0]);
          expect(second.violations[0]).toEqual(first.violations[0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 repeated evaluation returns fresh result arrays",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevNoout001(context, { applicable: true });
          const second = evaluateRevNoout001(context, { applicable: true });
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations).toEqual(first.violations);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 evaluations across contexts share no mutable state",
      () => {
        const firstContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });
        const secondContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/other.ts": "export const other = 1;\n",
          },
        });

        try {
          const first = evaluateRevNoout001(firstContext, {
            applicable: true,
          });
          evaluateRevNoout001(secondContext, { applicable: true });
          const again = evaluateRevNoout001(firstContext, {
            applicable: true,
          });
          expect(again).toEqual(first);
          expect(again).not.toBe(first);
          expect(again.violations.map((v) => v.module)).toEqual([
            "src/lonely.ts",
          ]);
        } finally {
          finish(firstContext);
          finish(secondContext);
        }
      },
      30000,
    );
  });
});
