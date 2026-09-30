import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { ModuleEdge } from "../src/repository/module-edges.js";
import type { RevDupedge001Result } from "../src/repository/rev-dupedge-001.js";
import {
  evaluateRevDupedge001,
  isRevDupedge001Duplicate,
} from "../src/repository/rev-dupedge-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevDupedge001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevDupedge001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

const DUPLICATE_NAMED = {
  "src/a.ts":
    'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n',
  "src/target.ts": "export const helper = 1;\n",
};

describe("REV-DUPEDGE-001 duplicate module-edge review", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED);

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
        const { context, result } = evaluate(DUPLICATE_NAMED, {
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
      "03 evaluates when applicability is exactly true",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
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
      "04 produces no evaluation for any non-boolean applicability value",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(DUPLICATE_NAMED, {
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

  describe("basic duplicates", () => {
    it(
      "05 reports repeated bare imports",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import "./target.js";\nimport "./target.js";\nexport const value = 1;\n',
            "src/target.ts": "export const value = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]).toEqual({
            source: "src/a.ts",
            target: "src/target.ts",
            rawSpecifier: "./target.js",
            kind: "runtime",
            via: "import",
            importedNames: [],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports repeated named imports",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual(["helper"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports repeated default imports",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import target from "./target.js";\nimport target from "./target.js";\nexport default target;\n',
            "src/target.ts": "export default 1;\n",
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
      "08 reports repeated namespace imports",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import * as target from "./target.js";\nimport * as target from "./target.js";\nexport const useTarget = target;\n',
            "src/target.ts": "export const value = 1;\n",
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
      "09 reports repeated export-from statements",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export { helper } from "./target.js";\nexport { helper } from "./target.js";\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]).toEqual({
            source: "src/a.ts",
            target: "src/target.ts",
            rawSpecifier: "./target.js",
            kind: "runtime",
            via: "export-from",
            importedNames: ["helper"],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 reports repeated export-star statements",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export * from "./target.js";\nexport * from "./target.js";\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.via).toBe("export-star");
          expect(result.violations[0]?.importedNames).toBeUndefined();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 reports repeated namespace re-exports",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export * as target from "./target.js";\nexport * as target from "./target.js";\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]).toEqual({
            source: "src/a.ts",
            target: "src/target.ts",
            rawSpecifier: "./target.js",
            kind: "runtime",
            via: "re-export-namespace",
            importedNames: ["target"],
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("non-duplicates", () => {
    it(
      "12 reports nothing for a singleton edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(1);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 does not treat different raw specifiers as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.to).toBe("src/target.ts");
          expect(edges[1]?.to).toBe("src/target.ts");
          expect(edges[0]?.rawSpecifier).not.toBe(edges[1]?.rawSpecifier);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 does not treat different via values as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nexport { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.via).toBe("import");
          expect(edges[1]?.via).toBe("export-from");
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 does not treat runtime and type-only statements as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper as runtimeHelper } from "./target.js";\nimport type { helper as typeHelper } from "./target.js";\nexport const useHelper = runtimeHelper;\nexport type Alias = typeof typeHelper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges.map((edge) => edge.kind).sort()).toEqual([
            "runtime",
            "type-only",
          ]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 does not treat different imported names as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { other } from "./target.js";\nexport const useHelper = helper;\nexport const useOther = other;\n',
            "src/target.ts":
              "export const helper = 1;\nexport const other = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(2);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 treats undefined and empty imported names as unequal",
      () => {
        const edge: ModuleEdge = {
          from: "src/a.ts",
          to: "src/target.ts",
          rawSpecifier: "./target.js",
          kind: "runtime",
          via: "import",
          importedNames: undefined,
        };
        const previous: ModuleEdge = {
          ...edge,
          importedNames: [],
        };

        expect(isRevDupedge001Duplicate(edge, [previous])).toBe(false);
        expect(isRevDupedge001Duplicate(previous, [edge])).toBe(false);
      },
      30000,
    );

    it(
      "18 does not treat different targets as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { value as first } from "./first.js";\nimport { value as second } from "./second.js";\nexport const useFirst = first;\nexport const useSecond = second;\n',
            "src/first.ts": "export const value = 1;\n",
            "src/second.ts": "export const value = 2;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.to).not.toBe(edges[1]?.to);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 does not treat different sources as duplicates",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { shared } from "./shared.js";\nexport const useShared = shared;\n',
            "src/b.ts":
              'import { shared } from "./shared.js";\nexport const useShared = shared;\n',
            "src/shared.ts": "export const shared = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.to).toBe(edges[1]?.to);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("edge categories", () => {
    it(
      "20 reports repeated runtime edges",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("runtime");
          expect(result.violations[0]?.target).toBe("src/target.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 reports repeated type-only edges",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import type { Config } from "./target.js";\nimport type { Config } from "./target.js";\nexport type LocalConfig = Config;\n',
            "src/target.ts": "export interface Config {\n  debug: boolean;\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("type-only");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 reports repeated unresolved edges",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { missing } from "./missing.js";\nimport { missing } from "./missing.js";\nexport const useMissing = missing;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.kind).toBe("unresolved");
          expect(edges[0]?.to).toBeNull();
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBeNull();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "23 reports repeated external edges",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { utility } from "some-package";\nimport { utility } from "some-package";\nexport const useUtility = utility;\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.kind).toBe("external");
          expect(edges[0]?.to).toBeNull();
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.kind).toBe("external");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 does not treat resolved and unresolved edges as duplicates",
      () => {
        const resolved: ModuleEdge = {
          from: "src/a.ts",
          to: "src/target.ts",
          rawSpecifier: "./target.js",
          kind: "runtime",
          via: "import",
          importedNames: ["helper"],
        };
        const unresolvedTarget: ModuleEdge = {
          ...resolved,
          to: null,
        };

        expect(resolved.to).not.toBe(unresolvedTarget.to);
        expect(resolved.from).toBe(unresolvedTarget.from);
        expect(resolved.rawSpecifier).toBe(unresolvedTarget.rawSpecifier);
        expect(resolved.kind).toBe(unresolvedTarget.kind);
        expect(resolved.via).toBe(unresolvedTarget.via);
        expect(resolved.importedNames).toBe(unresolvedTarget.importedNames);

        expect(isRevDupedge001Duplicate(resolved, [unresolvedTarget])).toBe(
          false,
        );
        expect(isRevDupedge001Duplicate(unresolvedTarget, [resolved])).toBe(
          false,
        );
      },
      30000,
    );

    it(
      "25 does not treat resolved and external edges as duplicates",
      () => {
        const resolved: ModuleEdge = {
          from: "src/a.ts",
          to: "src/target.ts",
          rawSpecifier: "./target.js",
          kind: "runtime",
          via: "import",
          importedNames: ["helper"],
        };
        const external: ModuleEdge = {
          ...resolved,
          to: null,
          rawSpecifier: "some-package",
          kind: "external",
        };

        expect(isRevDupedge001Duplicate(resolved, [external])).toBe(false);
        expect(isRevDupedge001Duplicate(external, [resolved])).toBe(false);
      },
      30000,
    );
  });

  describe("occurrence behavior", () => {
    it(
      "26 reports one violation for two identical occurrences",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          expect(context.allModuleEdges()).toHaveLength(2);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 reports two violations for three identical occurrences",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(3);
          expect(result.violations).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 reports repeated occurrences across multiple groups",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./helper.js";\nimport { helper } from "./helper.js";\nexport const useHelper = helper;\n',
            "src/b.ts":
              'import { other } from "./other.js";\nimport { other } from "./other.js";\nexport const useOther = other;\n',
            "src/helper.ts": "export const helper = 1;\n",
            "src/other.ts": "export const other = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(4);
          expect(result.violations).toHaveLength(2);
          expect(result.violations.map((violation) => violation.source)).toEqual([
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
      "29 detects repeats separated by unrelated edges",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { other } from "./other.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\nexport const useOther = other;\n',
            "src/other.ts": "export const other = 2;\n",
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(3);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.rawSpecifier).toBe("./target.js");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 preserves context occurrence order for identical evidence",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
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
  });

  describe("determinism", () => {
    it(
      "31 produces equivalent and independent results on repeated evaluation",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          const again = evaluateRevDupedge001(context, {
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
      "32 produces identical output for permuted source insertion order",
      () => {
        const target = "export const helper = 1;\n";
        const duplicate =
          'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n';

        const forward = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/a.ts": duplicate,
            "src/target.ts": target,
          },
        });
        const reverse = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/target.ts": target,
            "src/a.ts": duplicate,
          },
        });

        try {
          const first = evaluateRevDupedge001(forward, {
            applicable: true,
          });
          const second = evaluateRevDupedge001(reverse, {
            applicable: true,
          });

          expect(first.violations).toHaveLength(1);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        } finally {
          finish(forward);
          finish(reverse);
        }
      },
      30000,
    );

    it(
      "33 orders violations by the locked evidence sequence",
      () => {
        const { context, result } = evaluate(
          {
            "src/zeta.ts":
              'import { helper } from "./common.js";\nimport { helper } from "./common.js";\nexport const useHelper = helper;\n',
            "src/missing.ts":
              'import { missing } from "./absent.js";\nimport { missing } from "./absent.js";\nexport const useMissing = missing;\n',
            "src/alpha.ts":
              'import { other } from "./other.js";\nimport { other } from "./other.js";\nexport const useOther = other;\n',
            "src/common.ts": "export const helper = 1;\n",
            "src/other.ts": "export const other = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(6);
          expect(
            result.violations.map(
              (violation) =>
                `${violation.source}|${violation.target ?? ""}|${violation.rawSpecifier}|${violation.via}|${violation.kind}|${(violation.importedNames ?? []).join(",")}`,
            ),
          ).toEqual([
            "src/alpha.ts|src/other.ts|./other.js|import|runtime|other",
            "src/missing.ts||./absent.js|import|unresolved|missing",
            "src/zeta.ts|src/common.ts|./common.js|import|runtime|helper",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 retains stable order for completely identical evidence",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              'import { other } from "./other.js";\nimport { other } from "./other.js";\nimport { other } from "./other.js";\nexport const useOther = other;\n',
            "src/a.ts":
              'import { helper } from "./helper.js";\nimport { helper } from "./helper.js";\nimport { helper } from "./helper.js";\nexport const useHelper = helper;\n',
            "src/helper.ts": "export const helper = 1;\n",
            "src/other.ts": "export const other = 2;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(4);
          expect(
            result.violations.map((violation) => violation.source),
          ).toEqual(["src/a.ts", "src/a.ts", "src/b.ts", "src/b.ts"]);
          expect(result.violations[0]).toEqual(result.violations[1]);
          expect(result.violations[2]).toEqual(result.violations[3]);
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
          sources: DUPLICATE_NAMED,
        });

        try {
          const before = JSON.stringify(context.allModuleEdges());

          const result = evaluateRevDupedge001(context, {
            applicable: true,
          });

          expect(result.violations).toHaveLength(1);
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);

          const again = evaluateRevDupedge001(context, {
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
      "36 allocates independent results on repeated evaluation",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          const first = evaluateRevDupedge001(context, {
            applicable: true,
          });
          const second = evaluateRevDupedge001(context, {
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
      "37 does not expose context-owned imported names through violations",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          const returnedNames = result.violations[0]?.importedNames as
            | string[]
            | undefined;

          expect(returnedNames).toEqual(["helper"]);
          returnedNames?.push("changed");

          const again = evaluateRevDupedge001(context, {
            applicable: true,
          });

          expect(again.violations[0]?.importedNames).toEqual(["helper"]);
          expect(context.allModuleEdges()[0]?.importedNames).toEqual([
            "helper",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 allocates independent objects for identical duplicate evidence",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
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
  });

  describe("boundary and substrate", () => {
    it(
      "39 reports repeats within each via form without crossing via values",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { helper } from "./target.js";\nimport { helper } from "./target.js";\nexport { helper } from "./target.js";\nexport { helper } from "./target.js";\nexport * from "./target.js";\nexport * from "./target.js";\nexport * as target from "./target.js";\nexport * as target from "./target.js";\nexport const useHelper = helper;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(8);
          expect(result.violations).toHaveLength(4);
          expect(result.violations.map((violation) => violation.via)).toEqual([
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

    it(
      "40 orders null targets before canonical targets",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { missing } from "./absent.js";\nimport { missing } from "./absent.js";\nimport { helper } from "./common.js";\nimport { helper } from "./common.js";\nexport const useMissing = missing;\nexport const useHelper = helper;\n',
            "src/common.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(context.allModuleEdges()).toHaveLength(4);
          expect(result.violations).toHaveLength(2);
          expect(result.violations.map((violation) => violation.source)).toEqual([
            "src/a.ts",
            "src/a.ts",
          ]);
          expect(result.violations[0]?.target).toBeNull();
          expect(result.violations[1]?.target).toBe("src/common.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "41 keeps export-star imported names explicitly undefined",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export * from "./target.js";\nexport * from "./target.js";\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          const violation = result.violations[0];

          expect(result.violations).toHaveLength(1);
          expect(violation).toBeDefined();
          expect(
            Object.prototype.hasOwnProperty.call(violation, "importedNames"),
          ).toBe(true);
          expect(violation?.importedNames).toBeUndefined();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "42 reports substrate-identical bare and namespace imports",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import "./target.js";\nimport * as target from "./target.js";\nexport const useTarget = target;\n',
            "src/target.ts": "export const helper = 1;\n",
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges).toHaveLength(2);
          expect(edges[0]?.importedNames).toEqual([]);
          expect(edges[1]?.importedNames).toEqual([]);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.importedNames).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "43 uses only the supplied canonical-source universe",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { missing } from "./absent.js";\nimport { missing } from "./absent.js";\nexport const useMissing = missing;\n',
          },
          { applicable: true },
        );

        try {
          expect(context.canonicalPaths).toEqual(["src/a.ts"]);
          expect(context.hasSource("src/absent.ts")).toBe(false);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.target).toBeNull();
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "44 evaluates an inline source record without filesystem fixtures",
      () => {
        const { context, result } = evaluate(DUPLICATE_NAMED, {
          applicable: true,
        });

        try {
          expect(context.canonicalPaths).toEqual([
            "src/a.ts",
            "src/target.ts",
          ]);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
