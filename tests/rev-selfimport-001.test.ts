import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { ModuleEdge } from "../src/repository/module-edges.js";
import type { RevSelfimport001Result } from "../src/repository/rev-selfimport-001.js";
import {
  evaluateRevSelfimport001,
  isRevSelfimport001Violation,
} from "../src/repository/rev-selfimport-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevSelfimport001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevSelfimport001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const SELF_NAMED = {
  "src/self.ts": 'import { foo } from "./self.js";\nexport const foo = 1;\n',
};

describe("REV-SELFIMPORT-001 self-import review", () => {
  describe("applicability", () => {
    it(
      "01 evaluates when applicability is exactly true",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
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
      "02 produces no evaluation when applicability is explicitly false",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
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
      "03 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(SELF_NAMED);

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "04 produces no evaluation for any non-boolean applicability value",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(SELF_NAMED, {
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

  describe("positive — kind", () => {
    it(
      "05 reports a type-only import self-reference",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import type { Foo } from "./self.js";\nexport type Foo = { x: number };\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("type-only");
          expect(result.violations[0]?.via).toBe("import");
          expect(result.violations[0]?.importedNames).toEqual(["Foo"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports a type-only export-from self-reference",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export type { Foo } from "./self.js";\nexport type Foo = { x: number };\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("type-only");
          expect(result.violations[0]?.via).toBe("export-from");
          expect(result.violations[0]?.importedNames).toEqual(["Foo"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("positive — via", () => {
    it(
      "07 reports an import self-reference",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toEqual([
            {
              source: "src/self.ts",
              rawSpecifier: "./self.js",
              kind: "runtime",
              via: "import",
              importedNames: ["foo"],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports an export-from self-reference",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'const foo = 1;\nexport { foo } from "./self.js";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.via).toBe("export-from");
          expect(result.violations[0]?.kind).toBe("runtime");
          expect(result.violations[0]?.importedNames).toEqual(["foo"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports an export-star self-reference",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export const foo = 1;\nexport * from "./self.js";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.via).toBe("export-star");
          expect(result.violations[0]?.kind).toBe("runtime");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 reports a namespace re-export self-reference",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export const foo = 1;\nexport * as self from "./self.js";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.via).toBe("re-export-namespace");
          expect(result.violations[0]?.importedNames).toEqual(["self"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("positive — import clause shape", () => {
    it(
      "11 preserves an empty array for a bare side-effect import",
      () => {
        const { context, result } = evaluate(
          { "src/self.ts": 'import "./self.js";\nexport const foo = 1;\n' },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual([]);
          expect(result.violations[0]?.importedNames).not.toBeUndefined();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 preserves an empty array for a namespace import and does not disambiguate it from a bare import",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import * as self from "./self.js";\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 preserves the default binding marker for a default import",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import thing from "./self.js";\nexport default thing;\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual(["default"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 preserves exported names in source order for aliased export-from",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'const foo = 1;\nconst bar = 2;\nexport { foo as baz, bar } from "./self.js";\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual([
            "baz",
            "bar",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("negative", () => {
    it(
      "15 reports nothing for a normal resolved edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b.js";\nexport const useB = b;\n',
            "src/b.ts": "export const b = 1;\n",
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
      "16 reports nothing for an unresolved relative import",
      () => {
        const { context, result } = evaluate(
          { "src/a.ts": 'import { x } from "./missing.js";\nexport const u = x;\n' },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(1);
          expect(edges[0]?.kind).toBe("unresolved");
          expect(edges[0]?.to).toBeNull();
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 reports nothing for an external import",
      () => {
        const { context, result } = evaluate(
          { "src/a.ts": 'import { t } from "some-package";\nexport const u = t;\n' },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(1);
          expect(edges[0]?.kind).toBe("external");
          expect(edges[0]?.to).toBeNull();
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 reports nothing for a two-module cycle that contains no self edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { b } from "./b.js";\nexport const a = 1;\nexport const useB = b;\n',
            "src/b.ts": 'import { a } from "./a.js";\nexport const b = 1;\nexport const useA = a;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);

          for (const edge of edges) {
            expect(isRevSelfimport001Violation(edge)).toBe(false);
          }

          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 evaluates to an empty violation list for a source with no module edges",
      () => {
        const { context, result } = evaluate(
          { "src/a.ts": "export const foo = 1;\n" },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(0);
          expect(result).toEqual({ evaluated: true, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 reports nothing when two paths merely share a string prefix",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { x } from "./a-util.js";\nexport const useX = x;\n',
            "src/a-util.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(1);
          expect(edges[0]?.from).toBe("src/a.ts");
          expect(edges[0]?.to).toBe("src/a-util.ts");
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 reports nothing for a case-mismatched specifier, inheriting canonical case sensitivity",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": 'import { helper } from "./A";\nexport const useH = helper;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(1);
          expect(edges[0]?.kind).toBe("unresolved");
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 reports only the self edge in a file that also imports a sibling and an external module",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import { helper } from "./self.js";\nimport { other } from "./other.js";\nimport { ext } from "some-package";\nexport const helper = 1;\nexport const useOther = other;\nexport const useExt = ext;\n',
            "src/other.ts": "export const other = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(3);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.rawSpecifier).toBe("./self.js");
          expect(result.violations[0]?.source).toBe("src/self.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("duplicate semantics", () => {
    it(
      "23 preserves two identical bare self-imports as two violations",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import "./self.js";\nimport "./self.js";\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(2);
          expect(result.violations).toHaveLength(2);
          expect(result.violations[0]).toEqual(result.violations[1]);
          expect(result.violations[0]).not.toBe(result.violations[1]);
          expect(result.violations[0]?.importedNames).not.toBe(
            result.violations[1]?.importedNames,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 preserves two self-imports with different imported names as two violations",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import { foo } from "./self.js";\nimport { bar } from "./self.js";\nexport const foo = 1;\nexport const bar = 2;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(result.violations.map((v) => v.importedNames)).toEqual([
            ["bar"],
            ["foo"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 reports all four via forms present on a single file",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import { a } from "./self.js";\nexport { b } from "./self.js";\nexport * from "./self.js";\nexport * as ns from "./self.js";\nexport const a = 1;\nexport const b = 2;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(4);
          expect(result.violations).toHaveLength(4);
          expect(result.violations.map((v) => v.via)).toEqual([
            "export-from",
            "export-star",
            "import",
            "re-export-namespace",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("evidence contract", () => {
    it(
      "26 exposes exactly the five locked evidence keys",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];

          expect(violation).toBeDefined();
          expect(Object.keys(violation as object).sort()).toEqual([
            "importedNames",
            "kind",
            "rawSpecifier",
            "source",
            "via",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 exposes exact field values derived from the edge",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];

          expect(violation).toEqual({
            source: "src/self.ts",
            rawSpecifier: "./self.js",
            kind: "runtime",
            via: "import",
            importedNames: ["foo"],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 omits target because it is mathematically identical to source",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const keys = Object.keys(result.violations[0] as object);

          expect(keys).not.toContain("target");
          expect(keys).not.toContain("to");

          const edge = context.allModuleEdges()[0] as ModuleEdge;

          expect(edge.from).toBe(edge.to);
          expect(result.violations[0]?.source).toBe(edge.from);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 keeps importedNames an explicit own property when its value is undefined",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export const foo = 1;\nexport * from "./self.js";\n',
          },
          { applicable: true },
        );

        try {
          const violation = result.violations[0];

          expect(violation).toBeDefined();
          expect(Object.prototype.hasOwnProperty.call(violation, "importedNames")).toBe(
            true,
          );
          expect(violation?.importedNames).toBeUndefined();
          expect(Object.keys(violation as object)).toContain("importedNames");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 produces no forbidden field",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          const keys = Object.keys(violation as object);
          const forbidden = [
            "to",
            "target",
            "location",
            "line",
            "column",
            "offset",
            "severity",
            "confidence",
            "message",
            "remediation",
            "boundary",
          ];

          for (const key of forbidden) {
            expect(keys).not.toContain(key);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 copies kind from the edge rather than hardcoding a literal",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import type { Foo } from "./self.js";\nexport type Foo = { x: number };\n',
          },
          { applicable: true },
        );

        try {
          const edge = context.allModuleEdges()[0] as ModuleEdge;

          expect(edge.kind).toBe("type-only");
          expect(result.violations[0]?.kind).toBe("type-only");
          expect(result.violations[0]?.kind).not.toBe("runtime");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("source scope", () => {
    it(
      "32 reports a self-import in a test-looking path",
      () => {
        const { context, result } = evaluate(
          {
            "tests/self.test.ts":
              'import { helper } from "./self.test.js";\nexport const helper = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("tests/self.test.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 reports a self-import in a nested package and node_modules-like path",
      () => {
        const { context, result } = evaluate(
          {
            "packages/app/node_modules/pkg/src/self.ts":
              'import { helper } from "./self.js";\nexport const helper = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe(
            "packages/app/node_modules/pkg/src/self.ts",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 reports a self-import in a nested directory index module",
      () => {
        const { context, result } = evaluate(
          {
            "src/dir/index.ts":
              'import { helper } from "./index.js";\nexport const helper = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/dir/index.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "35 reports the self edge and not the unresolved edge in a partial source universe",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./a.js";\nimport { missing } from "./absent.js";\nexport const helper = 1;\nexport const useMissing = missing;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges.filter((e) => e.kind === "unresolved")).toHaveLength(1);
          expect(context.hasSource("src/absent.ts")).toBe(false);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/a.ts");
          expect(result.violations[0]?.rawSpecifier).toBe("./a.js");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("path identity", () => {
    it(
      "36 reports a self-import written with dot-segment normalization",
      () => {
        const { context, result } = evaluate(
          {
            "src/dir/x.ts":
              'import { helper } from "./../dir/x.js";\nexport const helper = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()[0]?.rawSpecifier).toBe(
            "./../dir/x.js",
          );
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.source).toBe("src/dir/x.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 reports an extensionless self-import",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import { helper } from "./self";\nexport const helper = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.rawSpecifier).toBe("./self");
          expect(result.violations[0]?.source).toBe("src/self.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 uses resolved endpoints rather than the authored specifier when a sibling shadows the extensionless match",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.css": ".a { color: red; }\n",
            "src/a.ts":
              'import "./a";\nimport "./a.js";\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);

          for (const edge of edges) {
            expect(edge.from).toBe("src/a.ts");
            expect(edge.to).toBe("src/a.css");
            expect(isRevSelfimport001Violation(edge)).toBe(false);
          }

          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("unsupported substrate", () => {
    it(
      "39 emits no module edge for a dynamic import of the source itself",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export const load = async () => import("./self.js");\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(0);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "40 emits no module edge for a CommonJS require of the source itself",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'export const req = () => require("./self.js");\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(0);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "41 produces identical output for permuted source insertion order",
      () => {
        const zeta = 'import { z } from "./zeta.js";\nexport const z = 1;\n';
        const alpha = 'import { a } from "./alpha.js";\nexport const a = 1;\n';
        const mid = 'import { m } from "./mid.js";\nexport const m = 1;\n';

        const forward = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/zeta.ts": zeta,
            "src/alpha.ts": alpha,
            "src/mid.ts": mid,
          },
        });
        const reverse = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/mid.ts": mid,
            "src/alpha.ts": alpha,
            "src/zeta.ts": zeta,
          },
        });

        try {
          const first = evaluateRevSelfimport001(forward, {
            applicable: true,
          });
          const second = evaluateRevSelfimport001(reverse, {
            applicable: true,
          });

          expect(first.violations).toHaveLength(3);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        } finally {
          finish(forward);
          finish(reverse);
        }
      },
      30000,
    );

    it(
      "42 yields equivalent data and independent objects on repeated evaluation",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const again = evaluateRevSelfimport001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(JSON.stringify(result));
          expect(again).not.toBe(result);
          expect(again.violations).not.toBe(result.violations);
          expect(again.violations[0]).not.toBe(result.violations[0]);
          expect(again.violations[0]?.importedNames).not.toBe(
            result.violations[0]?.importedNames,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "43 orders by source, rawSpecifier, via, kind, then importedNames, and keeps identical evidence in emission order",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              'import "./b.js";\nexport * from "./b.js";\nimport { zed } from "./b.js";\nimport { abc } from "./b.js";\nexport const x = 1;\n',
            "src/a.ts":
              'import "./a.js";\nimport "./a.js";\nexport const y = 1;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(6);
          expect(
            result.violations.map(
              (v) => `${v.source}|${v.rawSpecifier}|${v.via}|${v.kind}|${(v.importedNames ?? []).join(",")}`,
            ),
          ).toEqual([
            "src/a.ts|./a.js|import|runtime|",
            "src/a.ts|./a.js|import|runtime|",
            "src/b.ts|./b.js|export-star|runtime|",
            "src/b.ts|./b.js|import|runtime|",
            "src/b.ts|./b.js|import|runtime|abc",
            "src/b.ts|./b.js|import|runtime|zed",
          ]);

          expect(result.violations[0]).toEqual(result.violations[1]);

          expect(result.violations[2]?.via).toBe("export-star");
          expect(result.violations[2]?.importedNames).toBeUndefined();

          expect(result.violations[3]?.importedNames).toEqual([]);
          expect(result.violations[4]?.importedNames).toEqual(["abc"]);
          expect(result.violations[5]?.importedNames).toEqual(["zed"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("mutation safety", () => {
    it(
      "44 leaves the context-owned module edge table unchanged",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/self.ts":
              'import { foo } from "./self.js";\nexport * from "./self.js";\nexport const foo = 1;\n',
          },
        });

        try {
          const before = JSON.stringify(context.allModuleEdges());

          const result = evaluateRevSelfimport001(context, {
            applicable: true,
          });

          expect(result.violations).toHaveLength(2);
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);

          const again = evaluateRevSelfimport001(context, {
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
      "45 allocates a fresh result, violations array, and violation object per evaluation",
      () => {
        const { context, result } = evaluate(SELF_NAMED, {
          applicable: true,
        });

        try {
          const first = evaluateRevSelfimport001(context, {
            applicable: true,
          });
          const second = evaluateRevSelfimport001(context, {
            applicable: true,
          });

          expect(first).not.toBe(second);
          expect(first.violations).not.toBe(second.violations);
          expect(first.violations[0]).not.toBe(second.violations[0]);
          expect(result.violations).not.toBe(first.violations);
          expect(result.violations[0]).not.toBe(first.violations[0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "46 defensively copies importedNames rather than sharing the substrate array",
      () => {
        const { context, result } = evaluate(
          {
            "src/self.ts":
              'import "./self.js";\nimport { foo } from "./self.js";\nexport const foo = 1;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(result.violations).toHaveLength(2);

          let compared = 0;

          for (let index = 0; index < result.violations.length; index += 1) {
            const violation = result.violations[index];
            const edge = edges[index] as ModuleEdge;

            expect(violation).toBeDefined();
            expect(violation?.importedNames).toEqual(
              edge.importedNames ?? [],
            );
            expect(violation?.importedNames).not.toBe(edge.importedNames);
            compared += 1;
          }

          expect(compared).toBe(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
