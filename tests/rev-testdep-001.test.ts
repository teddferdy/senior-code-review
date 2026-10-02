import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevTestdep001Result } from "../src/repository/rev-testdep-001.js";
import { evaluateRevTestdep001 } from "../src/repository/rev-testdep-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevTestdep001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevTestdep001(context, options) };
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

const HELPER = {
  "src/a.ts": 'import { h } from "../tests/helper";\n',
  "tests/helper.ts": "export function h(): void {}\n",
};

describe("REV-TESTDEP-001 production-to-test dependency", () => {
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

    it(
      "04 evaluates with no findings for an edge-free universe",
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

  describe("edge forms", () => {
    it(
      "05 reports a runtime import with complete evidence",
      () => {
        const { context, result } = evaluate(HELPER, { applicable: true });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports a type-only import preserving its kind",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import type { F } from "../tests/fixture";\n',
            "tests/fixture.ts": "export interface F { x: number }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/fixture.ts",
              rawSpecifier: "../tests/fixture",
              kind: "type-only",
              via: "import",
              importedNames: ["F"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports an export-from leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'export { h } from "../tests/helper";\n',
            "tests/helper.ts": "export function h(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "export-from",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports an export-star leg with absent imported names",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts": 'export * from "../tests/utils";\n',
            "tests/utils.ts": "export const u = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0];
          expect(violation).toEqual({
            from: "src/b.ts",
            to: "tests/utils.ts",
            rawSpecifier: "../tests/utils",
            kind: "runtime",
            via: "export-star",
            importedNames: undefined,
          });
          expect(violation?.importedNames).toBeUndefined();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports a namespace re-export with its namespace name",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts": 'export * as ns from "../tests/utils";\n',
            "tests/utils.ts": "export const u = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/b.ts",
              to: "tests/utils.ts",
              rawSpecifier: "../tests/utils",
              kind: "runtime",
              via: "re-export-namespace",
              importedNames: ["ns"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "41 reports a side-effect import with empty imported names",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "../tests/setup";\n',
            "tests/setup.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/setup.ts",
              rawSpecifier: "../tests/setup",
              kind: "runtime",
              via: "import",
              importedNames: [],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("direction", () => {
    it(
      "10 reports src to tests while ignoring the reverse leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nexport function a(): void {}\n',
            "tests/helper.ts": "export function h(): void {}\n",
            "tests/t.ts": 'import { a } from "../src/a";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 a tests to src edge alone is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts": 'import { a } from "../src/a";\n',
            "src/a.ts": "export const a = 1;\n",
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
      "12 a tests to tests edge is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts": 'import { u } from "./u";\n',
            "tests/u.ts": "export const u = 1;\n",
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
      "13 a src to src edge is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\n',
            "src/b.ts": "export const b = 1;\n",
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
      "43 a self-import within src is not a violation",
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
      "44 a self-import within tests is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts": 'import "./t";\nexport const t = 1;\n',
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
  });

  describe("path boundaries", () => {
    it(
      "14 reports a deeply nested src reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a/b/c.ts": 'import { h } from "../../../tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a/b/c.ts",
              to: "tests/h.ts",
              rawSpecifier: "../../../tests/h",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 reports a deeply nested tests target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { e } from "../tests/d/e";\n',
            "tests/d/e.ts": "export const e = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/d/e.ts",
              rawSpecifier: "../tests/d/e",
              kind: "runtime",
              via: "import",
              importedNames: ["e"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 a src2 reportee is out of scope",
      () => {
        const { context, result } = evaluate(
          {
            "src2/a.ts": 'import { h } from "../tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src2/a.ts");
          expect(edge?.kind).toBe("runtime");
          expect(edge?.to).toBe("tests/h.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 a my-src reportee is out of scope",
      () => {
        const { context, result } = evaluate(
          {
            "my-src/a.ts": 'import { h } from "../tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
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
      "18 a tests2 target is out of scope",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { h } from "../tests2/h";\n',
            "tests2/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/a.ts");
          expect(edge?.kind).toBe("runtime");
          expect(edge?.to).toBe("tests2/h.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 a my-tests target is out of scope",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { h } from "../my-tests/h";\n',
            "my-tests/h.ts": "export const h = 1;\n",
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
      "20 uppercase directory variants are out of scope",
      () => {
        const upperFrom = evaluate(
          {
            "SRC/a.ts": 'import { h } from "../tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );
        const upperTo = evaluate(
          {
            "src/a.ts": 'import { h } from "../Tests/h";\n',
            "Tests/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(upperFrom.result.violations).toEqual([]);
          expect(upperTo.result.violations).toEqual([]);
        } finally {
          finish(upperFrom.context);
          finish(upperTo.context);
        }
      },
      30000,
    );

    it(
      "21 a root-level src.ts file is not a src reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src.ts": 'import { h } from "./tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
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
      "22 a root-level tests.ts file cannot bridge into scope",
      () => {
        const { context, result } = evaluate(
          {
            "tests.ts": 'import { a } from "./src/a";\n',
            "src/a.ts": "export const a = 1;\n",
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
      "42 a staged test file under src remains a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/helper.test.ts": 'import { h } from "../tests/h";\n',
            "tests/h.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/helper.test.ts",
              to: "tests/h.ts",
              rawSpecifier: "../tests/h",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("resolution", () => {
    it(
      "23 an unresolved test-like target is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { ghost } from "../tests/missing";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
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
      "24 a bare external specifier is not a violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import "some-package";\n',
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
      "25 a package literally named tests-helper is external",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { x } from "tests-helper";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
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

  describe("directness", () => {
    it(
      "26-28 a transitive chain yields only the direct second-leg finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\n',
            "src/b.ts": 'import { h } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/b.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("multiplicity", () => {
    it(
      "29 two distinct qualifying edges produce two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { h } from "../tests/helper";\n',
            "src/b.ts": 'import { i } from "../tests/other";\n',
            "tests/helper.ts": "export const h = 1;\n",
            "tests/other.ts": "export const i = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
            {
              from: "src/b.ts",
              to: "tests/other.ts",
              rawSpecifier: "../tests/other",
              kind: "runtime",
              via: "import",
              importedNames: ["i"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 exact duplicate qualifying edges remain two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nimport { h as h2 } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(result.violations[0]).toEqual(result.violations[1]);
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 same pair with runtime and type-only kinds remains two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nimport type { h as ht } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "type-only",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 same pair with different via values remains two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nexport { h } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "export-from",
              importedNames: ["h"],
            },
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 same pair with different raw specifiers remains two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h as h2 } from "./../tests/helper";\nimport { h } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "./../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 same pair with different imported names remains two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nimport { g as h2 } from "../tests/helper";\n',
            "tests/helper.ts": "export const h = 1;\nexport const g = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["g"],
            },
            {
              from: "src/a.ts",
              to: "tests/helper.ts",
              rawSpecifier: "../tests/helper",
              kind: "runtime",
              via: "import",
              importedNames: ["h"],
            },
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
      "35 shuffled source insertion order produces identical results",
      () => {
        const forward = {
          "src/a.ts": 'import { h } from "../tests/helper";\n',
          "src/b.ts": 'export * from "../tests/utils";\n',
          "tests/helper.ts": "export const h = 1;\n",
          "tests/utils.ts": "export const u = 1;\n",
        };
        const reversed = {
          "tests/utils.ts": "export const u = 1;\n",
          "tests/helper.ts": "export const h = 1;\n",
          "src/b.ts": 'export * from "../tests/utils";\n',
          "src/a.ts": 'import { h } from "../tests/helper";\n',
        };
        const first = evaluate(forward, { applicable: true });
        const second = evaluate(reversed, { applicable: true });

        try {
          expect(second.result).toEqual(first.result);
          expect(first.result.violations).toHaveLength(2);
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );

    it(
      "36 multiple findings follow the locked comparator ordering",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts": 'import { m } from "../tests/m";\n',
            "src/a.ts":
              'import { z } from "../tests/z";\nexport { z } from "../tests/z";\nimport type { t } from "../tests/z";\n',
            "tests/m.ts": "export const m = 1;\n",
            "tests/z.ts": "export const z = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              from: "src/a.ts",
              to: "tests/z.ts",
              rawSpecifier: "../tests/z",
              kind: "runtime",
              via: "export-from",
              importedNames: ["z"],
            },
            {
              from: "src/a.ts",
              to: "tests/z.ts",
              rawSpecifier: "../tests/z",
              kind: "runtime",
              via: "import",
              importedNames: ["z"],
            },
            {
              from: "src/a.ts",
              to: "tests/z.ts",
              rawSpecifier: "../tests/z",
              kind: "type-only",
              via: "import",
              importedNames: ["t"],
            },
            {
              from: "src/b.ts",
              to: "tests/m.ts",
              rawSpecifier: "../tests/m",
              kind: "runtime",
              via: "import",
              importedNames: ["m"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("context safety", () => {
    it(
      "37 evaluation does not mutate context state",
      () => {
        const { context, result } = evaluate(HELPER, { applicable: true });

        try {
          const edgesBefore = context.allModuleEdges();
          const pathsBefore = [...context.canonicalPaths];
          expect(result.violations).toHaveLength(1);
          expect(context.allModuleEdges()).toEqual(edgesBefore);
          expect([...context.canonicalPaths]).toEqual(pathsBefore);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 repeated evaluation returns equal values",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: HELPER,
        });

        try {
          const first = evaluateRevTestdep001(context, { applicable: true });
          const second = evaluateRevTestdep001(context, { applicable: true });
          expect(second).toEqual(first);
          expect(first.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "39 repeated evaluation returns independently allocated objects",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: HELPER,
        });

        try {
          const first = evaluateRevTestdep001(context, { applicable: true });
          const second = evaluateRevTestdep001(context, { applicable: true });
          expect(second).not.toBe(first);
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations[0]).not.toBe(first.violations[0]);
          expect(second.violations[0]?.importedNames).not.toBe(
            first.violations[0]?.importedNames,
          );
          expect(second.violations[0]?.importedNames).toEqual(
            first.violations[0]?.importedNames,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "40 imported names evidence does not share array identity with table edges",
      () => {
        const { context, result } = evaluate(HELPER, { applicable: true });

        try {
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0];
          const edge = context
            .allModuleEdges()
            .find((entry) => entry.from === "src/a.ts");
          expect(edge?.importedNames).toEqual(["h"]);
          expect(violation?.importedNames).toEqual(["h"]);
          expect(violation?.importedNames).not.toBe(edge?.importedNames);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
