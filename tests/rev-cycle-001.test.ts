import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevCycle001Result } from "../src/repository/rev-cycle-001.js";
import { evaluateRevCycle001 } from "../src/repository/rev-cycle-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevCycle001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevCycle001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

describe("REV-CYCLE-001 internal import-cycle violation", () => {
  it(
    "evaluates when applicability is exactly true",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no evaluation when applicability is explicitly false",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: false },
      );

      try {
        expect(result).toEqual({ evaluated: false, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no evaluation when applicability is omitted",
    () => {
      const { context, result } = evaluate({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
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
    "produces no evaluation for a non-true applicability value",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: "true" as unknown as boolean },
      );

      try {
        expect(result).toEqual({ evaluated: false, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a two-node cycle as one closed canonical path",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a three-node cycle as one closed canonical path",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./c";\nexport const b = 2;',
          "src/c.ts": 'import "./a";\nexport const c = 3;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/c.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a barrel export-from cycle",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export { b } from "./b";\nexport const a = 1;',
          "src/b.ts": 'export { a } from "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an export-star cycle",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export * from "./b";\nexport const a = 1;',
          "src/b.ts": 'export * from "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a re-export-namespace cycle",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export * as b from "./b";\nexport const a = 1;',
          "src/b.ts": 'export * as a from "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a pure type-only cycle",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import type { B } from "./b";\nexport type A = B | number;',
          "src/b.ts":
            'import type { A } from "./a";\nexport type B = A | string;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a mixed runtime and type-only cycle as one cycle",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { b } from "./b";\nexport const a = b;',
          "src/b.ts":
            'import type { A } from "./a";\nexport type B = A | string;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for an acyclic graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./c";\nexport const b = 2;',
          "src/c.ts": "export const c = 3;",
        },
        { applicable: true },
      );

      try {
        expect(result).toEqual({ evaluated: true, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for an external-only graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import "some-package";\nexport const a = 1;',
          "src/b.ts":
            'import "other-package";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result).toEqual({ evaluated: true, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for an unresolved-only graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./missing";\nexport const a = 1;',
          "src/b.ts": 'import "./gone";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result).toEqual({ evaluated: true, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for a self-loop while keeping the underlying edge",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./a";\nexport const a = 1;',
        },
        { applicable: true },
      );

      try {
        expect(result).toEqual({ evaluated: true, violations: [] });
        expect(
          context
            .allModuleEdges()
            .filter((edge) => edge.from === "src/a.ts" && edge.to === "src/a.ts"),
        ).toHaveLength(1);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports multiple independent cycles in deterministic order",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
          "src/c.ts": 'import "./d";\nexport const c = 3;',
          "src/d.ts": 'import "./c";\nexport const d = 4;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations.map((v) => v.cyclePath)).toEqual([
          ["src/a.ts", "src/b.ts", "src/a.ts"],
          ["src/c.ts", "src/d.ts", "src/c.ts"],
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports only the cyclic component of a disconnected graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
          "src/c.ts": 'import "./d";\nexport const c = 3;',
          "src/d.ts": "export const d = 4;",
          "src/lonely.ts": "export const lonely = 5;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations.map((v) => v.cyclePath)).toEqual([
          ["src/a.ts", "src/b.ts", "src/a.ts"],
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "collapses duplicate parallel edges into a single cycle violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import "./b";\nimport "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(
          context
            .allModuleEdges()
            .filter((edge) => edge.from === "src/a.ts" && edge.to === "src/b.ts"),
        ).toHaveLength(2);
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces byte-identical output regardless of source insertion order",
    () => {
      const first = new AnalysisContextImpl({
        repositoryRoot: "/repo",
        sources: {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
          "src/c.ts": 'import "./d";\nexport const c = 3;',
          "src/d.ts": 'import "./c";\nexport const d = 4;',
        },
      });

      try {
        const firstResult = evaluateRevCycle001(first, { applicable: true });

        const second = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/d.ts": 'import "./c";\nexport const d = 4;',
            "src/c.ts": 'import "./d";\nexport const c = 3;',
            "src/b.ts": 'import "./a";\nexport const b = 2;',
            "src/a.ts": 'import "./b";\nexport const a = 1;',
          },
        });

        try {
          const secondResult = evaluateRevCycle001(second, {
            applicable: true,
          });

          expect(JSON.stringify(secondResult)).toBe(
            JSON.stringify(firstResult),
          );
          expect(secondResult.violations.map((v) => v.cyclePath)).toEqual([
            ["src/a.ts", "src/b.ts", "src/a.ts"],
            ["src/c.ts", "src/d.ts", "src/c.ts"],
          ]);
        } finally {
          finish(second);
        }
      } finally {
        finish(first);
      }
    },
    30000,
  );

  it(
    "exposes only the cycle path with the closing node retained",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);

        const violation = result.violations[0];

        expect(Object.keys(violation as object).sort()).toEqual([
          "cyclePath",
        ]);
        expect(violation?.cyclePath).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/a.ts",
        ]);

        const path = violation?.cyclePath as string[];

        expect(path[0]).toBe(path[path.length - 1]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "does not mutate the derivation result or context-owned state",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nexport const a = 1;',
          "src/b.ts": 'import "./a";\nexport const b = 2;',
        },
        { applicable: true },
      );

      try {
        const beforeEdges = JSON.stringify(context.allModuleEdges());
        const beforeResult = JSON.stringify(result);

        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(JSON.stringify(context.allModuleEdges())).toBe(beforeEdges);

        const again = evaluateRevCycle001(context, { applicable: true });

        expect(JSON.stringify(again)).toBe(beforeResult);
        expect(again.violations[0]?.cyclePath).not.toBe(
          result.violations[0]?.cyclePath,
        );
      } finally {
        finish(context);
      }
    },
    30000,
  );
});
