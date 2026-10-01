import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import { evaluateRevArch001 } from "../src/repository/rev-arch-001.js";
import type { RevArchTrans001Result } from "../src/repository/rev-arch-trans-001.js";
import { evaluateRevArchTrans001 } from "../src/repository/rev-arch-trans-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevArchTrans001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevArchTrans001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const TRANSITIVE_BASIC = {
  "src/repository/a.ts":
    'import { go } from "./mid";\nexport const useGo = go;\n',
  "src/repository/mid.ts": 'export { go } from "../ui/target";\n',
  "src/ui/target.ts": "export const go = 1;\n",
};

describe("REV-ARCH-TRANS-001 transitive module-level ARCH review", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC);

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
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
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
      "03 produces no evaluation for truthy non-boolean applicability",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(TRANSITIVE_BASIC, {
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
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
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

  describe("positive topology", () => {
    it(
      "05 reports a simple transitive path",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/a.ts");
          expect(result.violations[0]?.target).toBe("src/ui/target.ts");
          expect(result.violations[0]?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports a path with two intermediates",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nexport const useGo = go;\n',
            "src/repository/m1.ts": 'export { go } from "./m2";\n',
            "src/repository/m2.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(
            result.violations.map((violation) => violation.source),
          ).toEqual(["src/repository/a.ts", "src/repository/m1.ts"]);
          expect(
            result.violations.map((violation) => violation.target),
          ).toEqual(["src/ui/z.ts", "src/ui/z.ts"]);
          expect(
            result.violations[0]?.path.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/repository/m1.ts"],
            ["src/repository/m1.ts", "src/repository/m2.ts"],
            ["src/repository/m2.ts", "src/ui/z.ts"],
          ]);
          expect(result.violations[1]?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports a violation on the first path leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../ui/mid";\nexport const useGo = go;\n',
            "src/ui/mid.ts": 'export { go } from "./deep";\n',
            "src/ui/deep.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/a.ts");
          expect(result.violations[0]?.target).toBe("src/ui/deep.ts");
          expect(
            result.violations[0]?.path.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/ui/mid.ts"],
            ["src/ui/mid.ts", "src/ui/deep.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports a violation on a middle path leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nexport const useGo = go;\n',
            "src/repository/m1.ts": 'export { go } from "../ui/m2";\n',
            "src/ui/m2.ts": 'export { go } from "./z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(3);
          expect(
            result.violations.map((violation) => [
              violation.source,
              violation.target,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/ui/m2.ts"],
            ["src/repository/a.ts", "src/ui/z.ts"],
            ["src/repository/m1.ts", "src/ui/z.ts"],
          ]);
          expect(result.violations[1]?.path).toHaveLength(3);
          expect(result.violations[1]?.path[1]).toEqual({
            from: "src/repository/m1.ts",
            to: "src/ui/m2.ts",
            rawSpecifier: "../ui/m2",
            kind: "runtime",
            via: "export-from",
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports a violation on the final path leg",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          const path = result.violations[0]?.path ?? [];

          expect(path).toHaveLength(2);
          expect(path[path.length - 1]).toEqual({
            from: "src/repository/mid.ts",
            to: "src/ui/target.ts",
            rawSpecifier: "../ui/target",
            kind: "runtime",
            via: "export-from",
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("direct boundary", () => {
    it(
      "10 excludes direct repository to ui edges",
      () => {
        const sources = {
          "src/repository/a.ts":
            'import { go } from "../ui/t";\nexport const useGo = go;\n',
          "src/ui/t.ts": "export const go = 1;\n",
        };
        const { context, result } = evaluate(sources, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.evaluated).toBe(true);
          expect(arch.violations).toHaveLength(1);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 reports transitive paths containing a direct ARCH leg",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.evaluated).toBe(true);
          expect(arch.violations).toHaveLength(1);
          expect(arch.violations[0]).toMatchObject({
            source: "src/repository/mid.ts",
            target: "src/ui/target.ts",
          });
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("near misses", () => {
    it(
      "12 excludes ui-kit topology",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m";\nexport const useGo = go;\n',
            "src/repository/m.ts": 'export { go } from "../ui-kit/z";\n',
            "src/ui-kit/z.ts": "export const go = 1;\n",
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
      "13 excludes repository-extra sources",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../repository-extra/m";\nexport const useGo = go;\n',
            "src/repository-extra/m.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
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
      "14 excludes clean repository to lib to ui paths",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../lib/m";\nexport const useGo = go;\n',
            "src/lib/m.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
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
      "15 reports nothing when no path exists",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { b } from "./b";\nexport const useB = b;\n',
            "src/repository/b.ts": "export const b = 1;\n",
            "src/ui/z.ts": "export const z = 1;\n",
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

  describe("path topology", () => {
    it(
      "16 selects one finding across branching paths",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nimport { go as go2 } from "./m2";\nexport const useGo = [go, go2];\n',
            "src/repository/m1.ts": 'export { go } from "../ui/z";\n',
            "src/repository/m2.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/a.ts");
          expect(result.violations[0]?.target).toBe("src/ui/z.ts");
          expect(result.violations[0]?.path).toHaveLength(2);
          expect(result.violations[0]?.path[0]?.from).toBe(
            "src/repository/a.ts",
          );
          expect(result.violations[0]?.path[0]?.to).toBe(
            "src/repository/m1.ts",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 prefers the longer qualifying path over an excluded direct edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { z } from "../ui/Z";\nimport { y } from "./M";\nexport const useAll = [z, y];\n',
            "src/repository/M.ts": 'export { y } from "../ui/Z";\n',
            "src/ui/Z.ts": "export const z = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/a.ts");
          expect(result.violations[0]?.target).toBe("src/ui/Z.ts");
          expect(result.violations[0]?.path).toHaveLength(2);
          expect(result.violations[0]?.path[0]?.to).toBe(
            "src/repository/M.ts",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 discovers longer qualifying paths past clean shorter paths",
      () => {
        const sources = {
          "src/repository/A.ts":
            'import { v } from "../ui/X";\nimport { w } from "./B";\nexport const useAll = [v, w];\n',
          "src/repository/B.ts": 'export { w } from "../ui/X";\n',
          "src/ui/X.ts": "export const v = 1;\nexport const w = 2;\n",
        };
        const { context, result } = evaluate(sources, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.violations).toHaveLength(2);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/A.ts");
          expect(result.violations[0]?.target).toBe("src/ui/X.ts");
          expect(
            result.violations[0]?.path.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/A.ts", "src/repository/B.ts"],
            ["src/repository/B.ts", "src/ui/X.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 terminates on cyclic graphs with one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/A.ts":
              'import { x } from "./B";\nexport const useX = x;\n',
            "src/repository/B.ts":
              'import { x } from "./A";\nexport { y } from "../ui/C";\nexport const useX = x;\n',
            "src/ui/C.ts": "export const y = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/A.ts");
          expect(result.violations[0]?.target).toBe("src/ui/C.ts");
          expect(
            result.violations[0]?.path.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/A.ts", "src/repository/B.ts"],
            ["src/repository/B.ts", "src/ui/C.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 skips self-loops without losing real paths",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/A.ts":
              'import "./A";\nimport { x } from "./B";\nexport const useX = x;\n',
            "src/repository/B.ts": 'export { x } from "../ui/C";\n',
            "src/ui/C.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          const selfLoop = context
            .allModuleEdges()
            .filter(
              (edge) =>
                edge.from === "src/repository/A.ts" &&
                edge.to === "src/repository/A.ts",
            );

          expect(selfLoop).toHaveLength(1);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/repository/A.ts");
          expect(result.violations[0]?.target).toBe("src/ui/C.ts");
          expect(result.violations[0]?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 collapses duplicate topology to one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/A.ts":
              'import { x } from "./B";\nimport { x } from "./B";\nexport const useX = x;\n',
            "src/repository/B.ts": 'export { x } from "../ui/C";\n',
            "src/ui/C.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          const duplicates = context
            .allModuleEdges()
            .filter(
              (edge) =>
                edge.from === "src/repository/A.ts" &&
                edge.to === "src/repository/B.ts",
            );

          expect(duplicates).toHaveLength(2);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 treats parallel runtime and type-only edges as one topology",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/A.ts":
              'import { x } from "./B";\nimport type { y } from "./B";\nexport const useX = x;\nexport type Alias = typeof y;\n',
            "src/repository/B.ts": 'export { x, y } from "../ui/C";\n',
            "src/ui/C.ts": "export const x = 1;\nexport const y = 2;\n",
          },
          { applicable: true },
        );

        try {
          const parallel = context
            .allModuleEdges()
            .filter(
              (edge) =>
                edge.from === "src/repository/A.ts" &&
                edge.to === "src/repository/B.ts",
            );

          expect(parallel.map((edge) => edge.kind).sort()).toEqual([
            "runtime",
            "type-only",
          ]);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("edge kinds", () => {
    it(
      "23 preserves runtime kinds across the path",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.path.map((entry) => entry.kind),
          ).toEqual(["runtime", "runtime"]);
          expect(
            result.violations[0]?.path.map((entry) => entry.via),
          ).toEqual(["import", "export-from"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 reports type-only paths",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import type { go } from "./mid";\nexport type Alias = typeof go;\n',
            "src/repository/mid.ts": 'export type { go } from "../ui/target";\n',
            "src/ui/target.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.violations).toHaveLength(1);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.path.map((entry) => entry.kind),
          ).toEqual(["type-only", "type-only"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 excludes unresolved edges from traversal",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { m } from "./missing";\nimport { go } from "./B";\nexport const useAll = [m, go];\n',
            "src/repository/B.ts": 'export { go } from "../ui/C";\n',
            "src/ui/C.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          const unresolved = context
            .allModuleEdges()
            .filter((edge) => edge.kind === "unresolved");

          expect(unresolved.length).toBeGreaterThan(0);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBe("src/ui/C.ts");
          expect(
            result.violations[0]?.path.every(
              (entry) => entry.to !== null,
            ),
          ).toBe(true);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 excludes external edges from traversal",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { join } from "some-package";\nimport { go } from "./B";\nexport const useAll = [join, go];\n',
            "src/repository/B.ts": 'export { go } from "../ui/C";\n',
            "src/ui/C.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          const external = context
            .allModuleEdges()
            .filter((edge) => edge.kind === "external");

          expect(external.length).toBeGreaterThan(0);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBe("src/ui/C.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("re-export topology", () => {
    it(
      "27 traverses export-star legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./barrel";\nexport const useGo = go;\n',
            "src/repository/barrel.ts": 'export * from "../ui/impl";\n',
            "src/ui/impl.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.path.map((entry) => entry.via),
          ).toEqual(["import", "export-star"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 traverses namespace re-export legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { ns } from "./barrel";\nexport const useNs = ns;\n',
            "src/repository/barrel.ts":
              'export * as ns from "../ui/impl";\n',
            "src/ui/impl.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBe("src/ui/impl.ts");
          expect(
            result.violations[0]?.path.map((entry) => entry.via),
          ).toEqual(["import", "re-export-namespace"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 traverses renamed re-export legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { y } from "./barrel";\nexport const useY = y;\n',
            "src/repository/barrel.ts":
              'export { go as y } from "../ui/deep";\n',
            "src/ui/deep.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBe("src/ui/deep.ts");
          expect(result.violations[0]?.path[1]).toEqual({
            from: "src/repository/barrel.ts",
            to: "src/ui/deep.ts",
            rawSpecifier: "../ui/deep",
            kind: "runtime",
            via: "export-from",
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "30 orders findings by source across multiple pairs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/alpha.ts":
              'import { a } from "./iA";\nexport const useA = a;\n',
            "src/repository/iA.ts": 'export { a } from "../ui/tA";\n',
            "src/ui/tA.ts": "export const a = 1;\n",
            "src/repository/zeta.ts":
              'import { z } from "./iZ";\nexport const useZ = z;\n',
            "src/repository/iZ.ts": 'export { z } from "../ui/tZ";\n',
            "src/ui/tZ.ts": "export const z = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(
            result.violations.map((violation) => violation.source),
          ).toEqual(["src/repository/alpha.ts", "src/repository/zeta.ts"]);
          expect(
            result.violations.map((violation) => violation.target),
          ).toEqual(["src/ui/tA.ts", "src/ui/tZ.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 produces equivalent and independent results on repeated evaluation",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          const again = evaluateRevArchTrans001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(JSON.stringify(result));
          expect(again).not.toBe(result);
          expect(again.violations).not.toBe(result.violations);
          expect(again.violations[0]).not.toBe(result.violations[0]);
          expect(again.violations[0]?.path).not.toBe(
            result.violations[0]?.path,
          );
          expect(again.violations[0]?.path[0]).not.toBe(
            result.violations[0]?.path[0],
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("evidence", () => {
    it(
      "32 preserves the exact violation shape",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          expect(result.violations).toEqual([
            {
              source: "src/repository/a.ts",
              target: "src/ui/target.ts",
              boundary: "REV-ARCH-001: src/repository/** -> src/ui/**",
              path: [
                {
                  from: "src/repository/a.ts",
                  to: "src/repository/mid.ts",
                  rawSpecifier: "./mid",
                  kind: "runtime",
                  via: "import",
                },
                {
                  from: "src/repository/mid.ts",
                  to: "src/ui/target.ts",
                  rawSpecifier: "../ui/target",
                  kind: "runtime",
                  via: "export-from",
                },
              ],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 carries the exact REV-ARCH-001 boundary value",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.boundary).toBe(
            "REV-ARCH-001: src/repository/** -> src/ui/**",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 preserves full path order and fields",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nexport const useGo = go;\n',
            "src/repository/m1.ts": 'export { go } from "./m2";\n',
            "src/repository/m2.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations[0]?.path).toEqual([
            {
              from: "src/repository/a.ts",
              to: "src/repository/m1.ts",
              rawSpecifier: "./m1",
              kind: "runtime",
              via: "import",
            },
            {
              from: "src/repository/m1.ts",
              to: "src/repository/m2.ts",
              rawSpecifier: "./m2",
              kind: "runtime",
              via: "export-from",
            },
            {
              from: "src/repository/m2.ts",
              to: "src/ui/z.ts",
              rawSpecifier: "../ui/z",
              kind: "runtime",
              via: "export-from",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("mutation safety", () => {
    it(
      "35 leaves serialized context state unchanged",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: TRANSITIVE_BASIC,
        });

        try {
          const before = JSON.stringify(context.allModuleEdges());

          const result = evaluateRevArchTrans001(context, {
            applicable: true,
          });

          expect(result.violations).toHaveLength(1);
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);

          const again = evaluateRevArchTrans001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(JSON.stringify(result));
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "36 isolates subsequent evaluation from evidence mutation",
      () => {
        const { context, result } = evaluate(TRANSITIVE_BASIC, {
          applicable: true,
        });

        try {
          const expected = JSON.stringify(result);
          const violation = result.violations[0] as
            | { source: string; path: { from: string }[] }
            | undefined;

          expect(violation).toBeDefined();

          if (violation) {
            violation.source = "changed";

            if (violation.path[0]) {
              violation.path[0].from = "changed";
            }

            violation.path.push({ from: "changed" });
          }

          const again = evaluateRevArchTrans001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(expected);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 reports nothing for an empty graph",
      () => {
        const { context, result } = evaluate(
          {
            "src/lone.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toEqual([]);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
