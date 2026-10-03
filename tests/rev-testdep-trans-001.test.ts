import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import { evaluateRevArchTrans001 } from "../src/repository/rev-arch-trans-001.js";
import type { RevTestdepTrans001Result } from "../src/repository/rev-testdep-trans-001.js";
import { evaluateRevTestdepTrans001 } from "../src/repository/rev-testdep-trans-001.js";
import { evaluateRevTestdep001 } from "../src/repository/rev-testdep-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevTestdepTrans001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevTestdepTrans001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const CHAIN_BASIC = {
  "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
  "src/b.ts": 'import { t } from "../tests/t";\nexport const b = t;\n',
  "tests/t.ts": "export const t = 1;\n",
};

describe("REV-TESTDEP-TRANS-001 transitive production-to-test reachability", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when options are omitted",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC);

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
        const { context, result } = evaluate(CHAIN_BASIC, {
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
          const { context, result } = evaluate(CHAIN_BASIC, {
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

  describe("empty and basic topology", () => {
    it(
      "04 evaluates an empty repository to zero violations",
      () => {
        const { context, result } = evaluate({}, { applicable: true });

        try {
          expect(result).toEqual({ evaluated: true, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "05 leaves a direct src to tests edge to TESTDEP ownership",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { t } from "../tests/t";\nexport const a = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
          const direct = evaluateRevTestdep001(context, { applicable: true });
          expect(direct.evaluated).toBe(true);
          if (direct.evaluated) {
            expect(direct.violations).toHaveLength(1);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports a two-edge src to src to tests chain with exact path",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              source: "src/a.ts",
              target: "tests/t.ts",
              path: [
                {
                  from: "src/a.ts",
                  to: "src/b.ts",
                  rawSpecifier: "./b",
                  kind: "runtime",
                  via: "import",
                },
                {
                  from: "src/b.ts",
                  to: "tests/t.ts",
                  rawSpecifier: "../tests/t",
                  kind: "runtime",
                  via: "import",
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
      "07 reports a three-edge chain and its intermediate pair",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'import { c } from "./c";\nexport const b = c;\n',
            "src/c.ts":
              'import { t } from "../tests/t";\nexport const c = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const pairs = result.violations.map(
            (violation) => `${violation.source}=>${violation.target}`,
          );
          expect(pairs).toEqual(["src/a.ts=>tests/t.ts", "src/b.ts=>tests/t.ts"]);
          const long = result.violations[0] as (typeof result.violations)[number];
          expect(long?.path.map((leg) => leg.from)).toEqual([
            "src/a.ts",
            "src/b.ts",
            "src/c.ts",
          ]);
          expect(long?.path).toHaveLength(3);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("scope", () => {
    it(
      "08 reports nothing for tests to tests edges only",
      () => {
        const { context, result } = evaluate(
          {
            "tests/a.ts":
              'import { b } from "./b";\nexport const a = b;\n',
            "tests/b.ts": "export const b = 1;\n",
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
      "09 never sources a finding at a tests module",
      () => {
        const { context, result } = evaluate(
          {
            "tests/a.ts": 'import { b } from "../src/b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // (src/b, tests/t) is a direct leg: TESTDEP-owned, absent here.
          expect(result.violations).toEqual([]);
          for (const violation of result.violations) {
            expect(violation.source.split("/")[0]).toBe("src");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 traverses through an intermediate tests module",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/h";\nexport const a = h;\n',
            "tests/h.ts": 'import { k } from "./k";\nexport const h = k;\n',
            "tests/k.ts": "export const k = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.source).toBe("src/a.ts");
          expect(violation?.target).toBe("tests/k.ts");
          expect(violation?.path.map((leg) => leg.from)).toEqual([
            "src/a.ts",
            "tests/h.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 qualifies nested src and tests paths by top segment only",
      () => {
        const { context, result } = evaluate(
          {
            "src/nested/deep/a.ts":
              'import { b } from "../b";\nexport const a = b;\n',
            "src/nested/b.ts":
              'import { t } from "../../tests/unit/t";\nexport const b = t;\n',
            "tests/unit/t.ts": "export const t = 1;\n",
            "src/tests/fake.ts": "export const fake = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.source).toBe("src/nested/deep/a.ts");
          expect(violation?.target).toBe("tests/unit/t.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("null and unsupported edges", () => {
    it(
      "12 reports nothing across an external leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import x from "some-pkg";\nimport { b } from "./b";\nexport const a = [x, b];\n',
            "src/b.ts": "export const b = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some((edge) => edge.kind === "external"),
          ).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 reports nothing across an unresolved leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/missing";\nexport const b = t;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some((edge) => edge.kind === "unresolved"),
          ).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("edge kinds", () => {
    it(
      "14 reports a runtime-only path",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.kind)).toEqual([
            "runtime",
            "runtime",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 reports a type-only-only path",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import type { B } from "./b";\nexport const a: B = 1 as unknown as B;\n',
            "src/b.ts":
              'import type { T } from "../tests/t";\nexport type B = T;\n',
            "tests/t.ts": "export type T = number;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.kind)).toEqual([
            "type-only",
            "type-only",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 reports a mixed runtime and type-only path",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import type { B } from "./b";\nexport const a: B = 1 as unknown as B;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport type B = typeof t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.kind)).toEqual([
            "type-only",
            "runtime",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("edge vias", () => {
    it(
      "17 traverses an import leg",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
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

    it(
      "18 traverses an export-from leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'export { t } from "../tests/t";\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.via)).toEqual([
            "import",
            "export-from",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 traverses an export-star leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'export * from "../tests/t";\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.via)).toEqual([
            "import",
            "export-star",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 traverses a re-export-namespace leg alone",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'export * as tns from "../tests/t";\nexport const b = 1;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.via)).toEqual([
            "import",
            "re-export-namespace",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 traverses mixed vias across a longer chain",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'export { c } from "./c";\n',
            "src/c.ts": 'export * from "../tests/t";\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // The intermediate (src/b, tests/t) pair qualifies independently.
          expect(result.violations).toHaveLength(2);
          const violation = result.violations.find(
            (candidate) => candidate.source === "src/a.ts",
          ) as (typeof result.violations)[number] | undefined;
          expect(violation?.target).toBe("tests/t.ts");
          expect(violation?.path.map((leg) => leg.via)).toEqual([
            "import",
            "export-from",
            "export-star",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("cycles", () => {
    it(
      "22 terminates on a cycle with no tests target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'import { a } from "./a";\nexport const b = a;\n',
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
      "23 returns only length-qualified findings through a cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { a } from "./a";\nimport { t } from "../tests/t";\nexport const b = [a, t];\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // (src/b, tests/t) is a direct leg: TESTDEP-owned, absent here.
          // (src/a, tests/t) qualifies with the 2-edge path through src/b.
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.source).toBe("src/a.ts");
          expect(violation?.target).toBe("tests/t.ts");
          expect(violation?.path.map((leg) => leg.from)).toEqual([
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
      "24 ignores a self-loop and never emits it as evidence",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import "./a";\nimport { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some(
                (edge) => edge.from === "src/a.ts" && edge.to === "src/a.ts",
              ),
          ).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          for (const leg of violation?.path ?? []) {
            expect(leg.from).not.toBe(leg.to);
          }
          expect(violation?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("shortest path and ownership", () => {
    it(
      "25 suppresses a transitive candidate when a direct shortcut owns the pair",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { t } from "../tests/t";\nexport const a = [b, t];\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // Shortest path (src/a, tests/t) has length 1: TESTDEP-owned.
          expect(result.violations).toEqual([]);
          const direct = evaluateRevTestdep001(context, { applicable: true });
          expect(direct.evaluated).toBe(true);
          if (direct.evaluated) {
            const owned = direct.violations.filter(
              (violation) =>
                violation.from === "src/a.ts" &&
                violation.to === "tests/t.ts",
            );
            expect(owned).toHaveLength(1);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 selects the lexicographically earliest of equal-length paths",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { c } from "./c";\nexport const a = [b, c];\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "src/c.ts":
              'import { t } from "../tests/t";\nexport const c = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path.map((leg) => leg.from)).toEqual([
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
      "27 never replaces a shorter path with a longer one",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { z } from "./z";\nexport const a = [b, z];\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "src/z.ts": 'import { y } from "./y";\nexport const z = y;\n',
            "src/y.ts":
              'import { t } from "../tests/t";\nexport const y = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // The independent (src/z, tests/t) pair qualifies on its own.
          expect(result.violations).toHaveLength(2);
          const violation = result.violations.find(
            (candidate) => candidate.source === "src/a.ts",
          ) as (typeof result.violations)[number] | undefined;
          expect(violation?.target).toBe("tests/t.ts");
          expect(violation?.path).toHaveLength(2);
          expect(violation?.path.map((leg) => leg.from)).toEqual([
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
      "28 reports one finding per source reaching the same test target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "src/c.ts": 'import { b } from "./b";\nexport const c = b;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const sources = result.violations.map(
            (violation) => violation.source,
          );
          expect(sources).toEqual(["src/a.ts", "src/c.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("duplicates", () => {
    it(
      "29 collapses duplicate topology to one pair finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { b as b2 } from "./b";\nexport const a = [b, b2];\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .filter(
                (edge) =>
                  edge.from === "src/a.ts" && edge.to === "src/b.ts",
              ),
          ).toHaveLength(2);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 retains the first table-order edge as path evidence",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'export { t } from "../tests/t";\nexport * from "../tests/t";\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          const leg = violation?.path[1] as (typeof violation.path)[number];
          expect(leg?.from).toBe("src/b.ts");
          expect(leg?.to).toBe("tests/t.ts");
          expect(leg?.via).toBe("export-from");
          expect(leg?.rawSpecifier).toBe("../tests/t");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 does not multiply findings across duplicate occurrences",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nimport { t as t2 } from "../tests/t";\nexport const b = [t, t2];\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .filter(
                (edge) =>
                  edge.from === "src/b.ts" && edge.to === "tests/t.ts",
              ),
          ).toHaveLength(2);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation?.path).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("ordering and determinism", () => {
    it(
      "32 sorts findings by source then target in UTF-16 order",
      () => {
        const { context, result } = evaluate(
          {
            "src/B.ts":
              'import { h } from "../tests/h";\nexport const b = h;\n',
            "src/a.ts":
              'import { h } from "../tests/h";\nimport { g } from "../tests/g";\nexport const a = [h, g];\n',
            "src/m.ts":
              'import { g } from "../tests/g";\nexport const m = g;\n',
            "tests/h.ts": 'import { k } from "./k";\nexport const h = k;\n',
            "tests/g.ts": "export const g = 1;\n",
            "tests/k.ts": "export const k = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const pairs = result.violations.map(
            (violation) => `${violation.source}=>${violation.target}`,
          );
          // "B" (0x42) precedes "a" (0x61) in UTF-16 code units, while
          // locale-aware ordering would rank "a" first. Direct legs
          // (B->h, a->h, a->g, m->g) stay TESTDEP-owned and absent.
          expect(pairs).toEqual([
            "src/B.ts=>tests/k.ts",
            "src/a.ts=>tests/k.ts",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 produces identical output for reversed fixture insertion order",
      () => {
        const sources = {
          "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
          "src/b.ts":
            'import { t } from "../tests/t";\nexport const b = t;\n',
          "tests/t.ts": "export const t = 1;\n",
        };
        const first = evaluate(sources, { applicable: true });
        const reversed = evaluate(
          {
            "tests/t.ts": sources["tests/t.ts"],
            "src/b.ts": sources["src/b.ts"],
            "src/a.ts": sources["src/a.ts"],
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
      "34 produces deep-equal output on repeated evaluation",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevTestdepTrans001(context, {
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
      "35 emits exactly the locked evidence keys",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(Object.keys(violation ?? {}).sort()).toEqual([
            "path",
            "source",
            "target",
          ]);
          for (const leg of violation?.path ?? []) {
            expect(Object.keys(leg).sort()).toEqual([
              "from",
              "kind",
              "rawSpecifier",
              "to",
              "via",
            ]);
            expect(leg.to).not.toBeNull();
          }
          const serialized = JSON.stringify(violation);
          for (const forbidden of [
            "importedNames",
            "boundary",
            "severity",
            "message",
            "confidence",
            "remediation",
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
      "36 keeps path evidence contiguous from source to target",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b";\nexport const a = b;\n',
            "src/b.ts": 'import { c } from "./c";\nexport const b = c;\n',
            "src/c.ts":
              'import { t } from "../tests/t";\nexport const c = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations.find(
            (candidate) => candidate.source === "src/a.ts",
          ) as (typeof result.violations)[number] | undefined;
          expect(violation?.path[0]?.from).toBe("src/a.ts");
          const last =
            violation?.path[(violation?.path.length ?? 0) - 1];
          expect(last?.to).toBe("tests/t.ts");
          violation?.path.forEach((leg, index) => {
            if (index === 0) {
              return;
            }
            expect(leg.from).toBe(violation?.path[index - 1]?.to);
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("result and mutation safety", () => {
    it(
      "37 returns fresh violation arrays between evaluations",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevTestdepTrans001(context, {
            applicable: true,
          });
          expect(again.evaluated).toBe(true);
          if (result.evaluated && again.evaluated) {
            expect(again.violations).not.toBe(result.violations);
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
      "38 returns fresh nested violation and path objects",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevTestdepTrans001(context, {
            applicable: true,
          });
          expect(again.evaluated).toBe(true);
          if (result.evaluated && again.evaluated) {
            expect(result.violations).toHaveLength(1);
            expect(again.violations).toHaveLength(1);
            expect(again.violations[0]).not.toBe(result.violations[0]);
            expect(again.violations[0]?.path).not.toBe(
              result.violations[0]?.path,
            );
            expect(again.violations[0]?.path[0]).not.toBe(
              result.violations[0]?.path[0],
            );
            expect(again.violations[0]).toEqual(result.violations[0]);
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
      "39 leaves context-owned tables unchanged",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const before = JSON.stringify({
            paths: context.canonicalPaths,
            edges: context.allModuleEdges(),
            declarations: context.allDeclarations(),
          });
          evaluateRevTestdepTrans001(context, { applicable: true });
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
  });

  describe("coexistence", () => {
    it(
      "40 confirms TRANS never duplicates TESTDEP ownership on direct legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { t } from "../tests/t";\nexport const a = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result).toEqual({ evaluated: true, violations: [] });
          const direct = evaluateRevTestdep001(context, { applicable: true });
          expect(direct).toEqual({
            evaluated: true,
            violations: [
              {
                from: "src/a.ts",
                to: "tests/t.ts",
                rawSpecifier: "../tests/t",
                kind: "runtime",
                via: "import",
                importedNames: ["t"],
              },
            ],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "41 confirms distinct ownership on a shared chain fixture",
      () => {
        const { context, result } = evaluate(CHAIN_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const direct = evaluateRevTestdep001(context, { applicable: true });
          expect(direct.evaluated).toBe(true);
          if (direct.evaluated) {
            // TESTDEP owns only the direct src/b -> tests/t leg.
            expect(direct.violations).toHaveLength(1);
            expect(direct.violations[0]?.from).toBe("src/b.ts");
            expect(direct.violations[0]?.to).toBe("tests/t.ts");
          }
          const trans = result.violations[0] as (typeof result.violations)[number];
          expect(trans?.source).toBe("src/a.ts");
          expect(trans?.target).toBe("tests/t.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "42 lets ARCH-TRANS and TESTDEP-TRANS report different qualifying facts",
      () => {
        const sources = {
          "src/repository/a.ts":
            'import { m } from "./mid";\nexport const a = m;\n',
          "src/repository/mid.ts":
            'import { u } from "../ui/u";\nexport const m = u;\n',
          "src/ui/u.ts": "export const u = 1;\n",
          "src/x.ts": 'import { y } from "./y";\nexport const x = y;\n',
          "src/y.ts":
            'import { t } from "../tests/t";\nexport const y = t;\n',
          "tests/t.ts": "export const t = 1;\n",
        };
        const { context, result } = evaluate(sources, { applicable: true });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const trans = result.violations[0] as (typeof result.violations)[number];
          expect(trans?.source).toBe("src/x.ts");
          expect(trans?.target).toBe("tests/t.ts");
          const arch = evaluateRevArchTrans001(context, { applicable: true });
          expect(arch.evaluated).toBe(true);
          if (arch.evaluated) {
            expect(arch.violations).toHaveLength(1);
            expect(arch.violations[0]?.source).toBe("src/repository/a.ts");
            expect(arch.violations[0]?.target).toBe("src/ui/u.ts");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "43 keeps the intermediate-tests pair TESTDEP-owned while TRANS takes the longer pair",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/h";\nexport const a = h;\n',
            "tests/h.ts": 'import { k } from "./k";\nexport const h = k;\n',
            "tests/k.ts": "export const k = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const trans = result.violations[0] as (typeof result.violations)[number];
          expect(trans?.source).toBe("src/a.ts");
          expect(trans?.target).toBe("tests/k.ts");
          const direct = evaluateRevTestdep001(context, { applicable: true });
          expect(direct.evaluated).toBe(true);
          if (direct.evaluated) {
            const owned = direct.violations.filter(
              (violation) =>
                violation.from === "src/a.ts" &&
                violation.to === "tests/h.ts",
            );
            expect(owned).toHaveLength(1);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "44 confirms a self-loop cannot extend a shortest evidence path",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import "./a";\nimport { b } from "./b";\nexport const a = b;\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport const b = t;\n',
            "tests/t.ts": "export const t = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              source: "src/a.ts",
              target: "tests/t.ts",
              path: [
                {
                  from: "src/a.ts",
                  to: "src/b.ts",
                  rawSpecifier: "./b",
                  kind: "runtime",
                  via: "import",
                },
                {
                  from: "src/b.ts",
                  to: "tests/t.ts",
                  rawSpecifier: "../tests/t",
                  kind: "runtime",
                  via: "import",
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
  });
});
