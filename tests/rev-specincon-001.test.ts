import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevSpecincon001Result } from "../src/repository/rev-specincon-001.js";
import { evaluateRevSpecincon001 } from "../src/repository/rev-specincon-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevSpecincon001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevSpecincon001(context, options) };
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

describe("REV-SPECINCON-001 inconsistent module specifiers", () => {
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
      "03 evaluates with no findings for an edge-free universe",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result).toEqual({ evaluated: true, violations: [] });
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

  describe("positive cases", () => {
    it(
      "05 reports two distinct import specifiers for one pair",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { y } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports import plus export-from with distinct specifiers",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nexport { x } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports runtime plus type-only with distinct specifiers",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport type { T } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\nexport interface T { v: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports three spellings as exactly one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { y } from "../src/b";\nimport { z } from "./sub/../b";\n',
            "src/b.ts":
              "export const x = 1;\nexport const y = 2;\nexport const z = 3;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b", "./sub/../b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports a nested source pair with distinct spellings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a/b/c.ts":
              'import { x } from "../d";\nimport { y } from "../../a/d";\n',
            "src/a/d.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a/b/c.ts",
              to: "src/a/d.ts",
              specifiers: ["../../a/d", "../d"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 reports a tests pair with distinct spellings",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts":
              'import { x } from "./u";\nimport { y } from "../tests/u";\n',
            "tests/u.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "tests/t.ts",
              to: "tests/u.ts",
              specifiers: ["../tests/u", "./u"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 reports a self-pair with two distinct spellings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import "./a";\nimport "../src/a";\nexport const a = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/a.ts",
              specifiers: ["../src/a", "./a"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 reports one pair fed by all four via forms",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nexport { x } from "../src/b";\nexport * from "./b";\nexport * as ns from "../src/b";\n',
            "src/b.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("negative cases", () => {
    it(
      "13 identical specifier twice produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { x as x2 } from "./b";\n',
            "src/b.ts": "export const x = 1;\n",
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
      "14 distinct spellings to different targets produce no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { y } from "./c";\n',
            "src/b.ts": "export const x = 1;\n",
            "src/c.ts": "export const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 a single edge produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { x } from "./b";\n',
            "src/b.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 an unresolved target does not participate",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { ghost } from "./missing";\nimport { phant } from "../src/missing";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          for (const edge of context.allModuleEdges()) {
            expect(edge.to).toBeNull();
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 an external specifier does not participate",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "some-package";\nimport "other-package";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          for (const edge of context.allModuleEdges()) {
            expect(edge.kind).toBe("external");
            expect(edge.to).toBeNull();
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 same spelling across different vias produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nexport { x } from "./b";\n',
            "src/b.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 a self-pair with one spelling produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "./a";\nexport const a = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 an edge-free universe produces no findings",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result).toEqual({ evaluated: true, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("cardinality", () => {
    it(
      "21 duplicates plus two spellings yield exactly one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { x as x2 } from "./b";\nimport { y } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 many duplicates of each spelling yield exactly one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { x } from "./b";\nimport { x as x2 } from "./b";\nimport { x as x3 } from "./b";\nimport { y } from "../src/b";\nimport { y as y2 } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.specifiers).toEqual([
            "../src/b",
            "./b",
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
      "23 findings order by from",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              'import { a } from "./h1";\nimport { b } from "../src/h1";\n',
            "src/h1.ts": "export const a = 1;\nexport const b = 2;\n",
            "src/a.ts":
              'import { c } from "./h2";\nimport { d } from "../src/h2";\n',
            "src/h2.ts": "export const c = 1;\nexport const d = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.from)).toEqual([
            "src/a.ts",
            "src/b.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 same from orders by to",
      () => {
        const { context, result } = evaluate(
          {
            "src/main.ts":
              'import { m } from "./m";\nimport { m2 } from "../src/m";\nimport { z } from "./z";\nimport { z2 } from "../src/z";\n',
            "src/m.ts": "export const m = 1;\n",
            "src/z.ts": "export const z = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.to)).toEqual([
            "src/m.ts",
            "src/z.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 specifier lists sort UTF-16 independent of emission order",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export { x } from "../src/b";\nimport { y } from "./sub/../b";\nimport { x as x2 } from "./b";\nimport { y as y2 } from "../src/b";\n',
            "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "src/b.ts",
              specifiers: ["../src/b", "./b", "./sub/../b"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 digit-width paths prove ordinary UTF-16 comparison",
      () => {
        const { context, result } = evaluate(
          {
            "src/main.ts":
              'import { a } from "./a10";\nimport { a2 } from "../src/a10";\nimport { b } from "./a2";\nimport { b2 } from "../src/a2";\n',
            "src/a10.ts": "export const a = 1;\n",
            "src/a2.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.to)).toEqual([
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
      "27 case ordering follows UTF-16 code units, not locale rules",
      () => {
        const { context, result } = evaluate(
          {
            "src/main.ts":
              'import { x } from "./a";\nimport { y } from "../src/a";\nimport { b } from "./B";\nimport { b2 } from "../src/B";\n',
            "src/a.ts": "export const x = 1;\n",
            "src/B.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.to)).toEqual([
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
    const PAIR = {
      "src/a.ts": 'import { x } from "./b";\nimport { y } from "../src/b";\n',
      "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
    };

    it(
      "28 shuffled source insertion order produces identical results",
      () => {
        const forward = {
          "src/a.ts": PAIR["src/a.ts"],
          "src/b.ts": PAIR["src/b.ts"],
        };
        const reversed = {
          "src/b.ts": PAIR["src/b.ts"],
          "src/a.ts": PAIR["src/a.ts"],
        };
        const first = evaluate(forward, { applicable: true });
        const second = evaluate(reversed, { applicable: true });

        try {
          expect(second.result).toEqual(first.result);
          expect(first.result.violations).toHaveLength(1);
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );

    it(
      "29 repeated evaluation returns deep-equal results",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          const second = evaluateRevSpecincon001(context, {
            applicable: true,
          });
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
    const PAIR = {
      "src/a.ts": 'import { x } from "./b";\nimport { y } from "../src/b";\n',
      "src/b.ts": "export const x = 1;\nexport const y = 2;\n",
    };

    it(
      "30 evaluation does not mutate context state",
      () => {
        const { context, result } = evaluate(PAIR, { applicable: true });

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
      "31 evaluation does not mutate edge objects",
      () => {
        const { context, result } = evaluate(PAIR, { applicable: true });

        try {
          const edgesBefore = context.allModuleEdges();
          expect(result.violations).toHaveLength(1);
          const edgesAfter = context.allModuleEdges();
          expect(edgesAfter).toEqual(edgesBefore);
          expect(edgesAfter.map((edge) => edge.rawSpecifier)).toEqual(
            edgesBefore.map((edge) => edge.rawSpecifier),
          );
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
      "32 repeated evaluation returns independently allocated violations",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          const second = evaluateRevSpecincon001(context, {
            applicable: true,
          });
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
      "33 repeated evaluation returns fresh specifier arrays",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          const second = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          expect(second.violations[0]?.specifiers).not.toBe(
            first.violations[0]?.specifiers,
          );
          expect(second.violations[0]?.specifiers).toEqual(
            first.violations[0]?.specifiers,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 repeated evaluation returns fresh result arrays",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          const second = evaluateRevSpecincon001(context, {
            applicable: true,
          });
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations).toEqual(first.violations);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "35 evaluations across contexts share no mutable state",
      () => {
        const firstContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });
        const secondContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevSpecincon001(firstContext, {
            applicable: true,
          });
          evaluateRevSpecincon001(secondContext, { applicable: true });
          const again = evaluateRevSpecincon001(firstContext, {
            applicable: true,
          });
          expect(again).toEqual(first);
          expect(again).not.toBe(first);
          expect(again.violations).toHaveLength(1);
        } finally {
          finish(firstContext);
          finish(secondContext);
        }
      },
      30000,
    );
  });

  describe("blind spots", () => {
    it(
      "36 an aliased external spelling does not qualify",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { x } from "@/b";\nimport { y } from "@/b";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          for (const edge of context.allModuleEdges()) {
            expect(edge.kind).toBe("external");
            expect(edge.to).toBeNull();
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 a dynamic import produces no relevant module edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export async function load(): Promise<unknown> {\n  return import('./b');\n}\n",
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          expect(
            context
              .allModuleEdges()
              .filter((edge) => edge.rawSpecifier === "./b"),
          ).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 a require call produces no relevant module edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function load(): unknown {\n  return require('./b');\n}\n",
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          expect(
            context
              .allModuleEdges()
              .filter((edge) => edge.rawSpecifier === "./b"),
          ).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
