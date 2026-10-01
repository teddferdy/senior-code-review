import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevUnref001Result } from "../src/repository/rev-unref-001.js";
import { evaluateRevUnref001 } from "../src/repository/rev-unref-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevUnref001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevUnref001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

function modulesOf(result: RevUnref001Result): string[] {
  return result.violations.map((violation) => violation.module);
}

const LONELY = {
  "src/lonely.ts": "export const lonely = 1;\n",
};

describe("REV-UNREF-001 unreferenced module review", () => {
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
      "03 produces no evaluation for truthy non-boolean applicability",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(LONELY, {
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
  });

  describe("zero-inbound detection", () => {
    it(
      "04 reports a module with zero inbound references",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result.evaluated).toBe(true);
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
      "05 a runtime import reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { go } from "./used";\nexport const useGo = go;\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 a type-only import reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import type { Shape } from "./types";\nexport const s: Shape = { w: 1 };\n',
            "src/types.ts": "export interface Shape { w: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 an export-from reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/barrel.ts": 'export { go } from "./used";\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/barrel.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 an export-star reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/barrel.ts": 'export * from "./used";\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/barrel.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 a re-export-namespace reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/barrel.ts": 'export * as ns from "./used";\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/barrel.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 mixed runtime and type-only parallel edges rescue the target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { go } from "./used";\nimport type { Shape } from "./used";\nexport const useGo: Shape = go;\n',
            "src/used.ts":
              "export const go = { w: 1 };\nexport interface Shape { w: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 a test-to-src reference rescues the target",
      () => {
        const { context, result } = evaluate(
          {
            "tests/foo.test.ts":
              'import { go } from "../src/repository/bar";\nexport const useGo = go;\n',
            "src/repository/bar.ts": "export const go = 1;\n",
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
      "12 modules under tests are never reportees",
      () => {
        const { context, result } = evaluate(
          {
            "tests/lonely.test.ts": "export const lonely = 1;\n",
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
      "13 an unresolved edge does not rescue the importer",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { ghost } from "./missing";\nexport const useGhost = ghost;\n',
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 an external edge does not rescue the importer",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { map } from "lodash";\nexport const useMap = map;\n',
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 a resolved self-loop counts as an inbound reference",
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
      "16 duplicate runtime edges do not duplicate findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { go } from "./used";\nimport { go as go2 } from "./used";\nexport const pair = [go, go2];\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 multiple importers still rescue the shared target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { go } from "./used";\nexport const x = go;\n',
            "src/b.ts": 'import { go } from "./used";\nexport const y = go;\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts", "src/b.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 findings sort deterministically by module",
      () => {
        const { context, result } = evaluate(
          {
            "src/z.ts": "export const z = 1;\n",
            "src/a.ts": "export const a = 1;\n",
            "src/m.ts": "export const m = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual([
            "src/a.ts",
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
      "19 adversarial source insertion order still yields sorted findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/m.ts": "export const m = 1;\n",
            "src/z.ts": "export const z = 1;\n",
            "src/a.ts": "export const a = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual([
            "src/a.ts",
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
      "20 src index with zero inbound references is reported",
      () => {
        const { context, result } = evaluate(
          {
            "src/index.ts": 'console.log("boot");\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            { module: "src/index.ts", scope: "src/**" },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 modules outside src are never reportees",
      () => {
        const { context, result } = evaluate(
          {
            "scripts/tool.ts": "export const tool = 1;\n",
            "docs/notes.md": "# notes\n",
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
      "22 a dependency cycle does not produce false positives",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
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
      "23 dynamic import produces no reference edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export async function load(): Promise<number> {\n  const mod = await import("./real");\n  return mod.real;\n}\n',
            "src/real.ts": "export const real = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts", "src/real.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 an aliased specifier collapses to external and rescues nothing",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { go } from "@/lib";\nexport const useGo = go;\n',
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 a referrer outside src and tests does not rescue the target",
      () => {
        const { context, result } = evaluate(
          {
            "scripts/tool.ts":
              'import { go } from "../src/a";\nexport const useGo = go;\n',
            "src/a.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 a staged src test file is a reportee and can still refer",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.test.ts":
              'import { b } from "./b";\nexport const check = b;\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(modulesOf(result)).toEqual(["src/a.test.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 mutating a finding cannot affect repeated evaluation",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result.violations).toHaveLength(1);
          (result.violations as { module: string }[])[0]!.module = "changed";

          const { context: second, result: repeated } = evaluate(LONELY, {
            applicable: true,
          });

          try {
            expect(modulesOf(repeated)).toEqual(["src/lonely.ts"]);
          } finally {
            finish(second);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 evaluation leaves the context module table unchanged",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { go } from "./used";\nexport const x = go;\n',
            "src/used.ts": "export const go = 1;\n",
          },
          { applicable: true },
        );

        try {
          const beforeEdges = JSON.stringify(context.allModuleEdges());
          const beforePaths = JSON.stringify(context.canonicalPaths);

          evaluateRevUnref001(context, { applicable: true });

          expect(JSON.stringify(context.allModuleEdges())).toBe(beforeEdges);
          expect(JSON.stringify(context.canonicalPaths)).toBe(beforePaths);
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 repeated evaluation over one context is deterministic",
      () => {
        const { context, result } = evaluate(
          {
            "src/z.ts": "export const z = 1;\n",
            "src/a.ts": 'import { z } from "./z";\nexport const a = z;\n',
          },
          { applicable: true },
        );

        try {
          const repeated = evaluateRevUnref001(context, { applicable: true });

          expect(repeated).toEqual(result);
          expect(modulesOf(result)).toEqual(["src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 an empty source universe evaluates with no findings",
      () => {
        const { context, result } = evaluate({}, { applicable: true });

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
});
