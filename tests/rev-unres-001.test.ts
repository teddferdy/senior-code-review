import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevUnres001Result } from "../src/repository/rev-unres-001.js";
import { evaluateRevUnres001 } from "../src/repository/rev-unres-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevUnres001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevUnres001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

describe("REV-UNRES-001 unresolved relative import review", () => {
  it(
    "evaluates when applicability is exactly true",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { missing } from "./missing";',
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
          "src/a.ts": 'import { missing } from "./missing";',
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
        "src/a.ts": 'import { missing } from "./missing";',
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
          "src/a.ts": 'import { missing } from "./missing";',
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
    "reports an unresolved runtime import",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { missing } from "./missing";',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toEqual({
          source: "src/a.ts",
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "import",
          importedNames: ["missing"],
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an unresolved type-only import",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import type { Missing } from "./missing";\nexport type Local = Missing;',
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          source: "src/a.ts",
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "import",
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an unresolved export-from re-export",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export { missing } from "./missing";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "export-from",
          importedNames: ["missing"],
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an unresolved export-star re-export without imported names",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export * from "./missing";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "export-star",
        });
        expect(result.violations[0]?.importedNames).toBeUndefined();
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an unresolved re-export-namespace",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'export * as ns from "./missing";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "re-export-namespace",
          importedNames: ["ns"],
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for a resolved relative import",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { b } from "./b";\nexport const a = b;',
          "src/b.ts": "export const b = 1;",
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
    "produces no violation for a resolved type-only import",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import type { B } from "./b";\nexport type A = B;',
          "src/b.ts": "export type B = string;",
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
    "produces no violation for an external specifier",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import React from "react";\nimport { join } from "lodash";\nexport const a = [React, join];',
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
    "produces no violation for a fully resolved acyclic graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";',
          "src/b.ts": 'import "./c";',
          "src/c.ts": "export const c = 1;",
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
    "produces no violation for a self-import because it resolves to itself",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./a";\nexport const a = 1;',
        },
        { applicable: true },
      );

      try {
        expect(result).toEqual({ evaluated: true, violations: [] });

        const selfEdge = context
          .allModuleEdges()
          .find(
            (edge) =>
              edge.from === "src/a.ts" &&
              edge.to === "src/a.ts" &&
              edge.rawSpecifier === "./a",
          );

        expect(selfEdge?.kind).toBe("runtime");
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports only the unresolved edges of a mixed graph",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import { b } from "./b";\nimport { missing } from "./missing";\nexport const a = [b];',
          "src/b.ts": 'import "./c";\nexport const b = 1;',
          "src/c.ts": "export const c = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          source: "src/a.ts",
          rawSpecifier: "./missing",
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "keeps one violation per edge for a specifier imported under different names",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import { x } from "./missing";\nimport { y } from "./missing";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(2);
        expect(result.violations.map((violation) => violation.importedNames)).toEqual([
          ["x"],
          ["y"],
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "keeps two violations for two identical duplicate bare imports",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./missing";\nimport "./missing";',
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

  it(
    "produces no violation for duplicate parallel resolved edges",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./b";\nimport "./b";\nexport const a = 1;',
          "src/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(
          context
            .allModuleEdges()
            .filter(
              (edge) => edge.from === "src/a.ts" && edge.to === "src/b.ts",
            ),
        ).toHaveLength(2);
        expect(result).toEqual({ evaluated: true, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports unresolved specifiers across multiple files",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./missing-a";',
          "src/b.ts": 'import "./missing-b";',
          "src/c.ts": 'export * from "./missing-c";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(3);
        expect(result.violations.map((violation) => violation.source)).toEqual([
          "src/a.ts",
          "src/b.ts",
          "src/c.ts",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a specifier whose target is omitted from the supplied source set",
    () => {
      // The conceptual repository contains src/target.ts, but that file is
      // deliberately not supplied. Supplied-universe semantics therefore
      // classify the specifier as unresolved. No filesystem lookup is used
      // to establish this.
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { target } from "./target";\nexport const a = target;',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          source: "src/a.ts",
          rawSpecifier: "./target",
          kind: "unresolved",
        });
        expect(context.hasSource("src/target.ts")).toBe(false);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "applies no path filtering to test, fixture, nested-package, or monorepo-like paths",
    () => {
      const { context, result } = evaluate(
        {
          "tests/unit/helper.test.ts": 'import { m } from "./missing-test";',
          "tests/__fixtures__/seed.ts": 'import { m } from "./missing-fixture";',
          "packages/pkg/src/thing.ts": 'import { m } from "./missing-pkg";',
          "apps/web/src/deep/nested/mod.ts":
            'import { m } from "./missing-nested";',
          "generated/out/api.ts": 'import { m } from "./missing-generated";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(5);
        expect(result.violations.map((violation) => violation.source)).toEqual([
          "apps/web/src/deep/nested/mod.ts",
          "generated/out/api.ts",
          "packages/pkg/src/thing.ts",
          "tests/__fixtures__/seed.ts",
          "tests/unit/helper.test.ts",
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
          "src/a.ts": 'import { z } from "./missing-z";\nimport "./shared";',
          "src/b.ts": 'export * from "./missing-star";',
          "src/c.ts": 'export { q } from "./missing-q";',
        },
      });

      try {
        const firstResult = evaluateRevUnres001(first, { applicable: true });

        const second = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/c.ts": 'export { q } from "./missing-q";',
            "src/b.ts": 'export * from "./missing-star";',
            "src/a.ts": 'import { z } from "./missing-z";\nimport "./shared";',
          },
        });

        try {
          const secondResult = evaluateRevUnres001(second, { applicable: true });

          expect(JSON.stringify(secondResult)).toBe(
            JSON.stringify(firstResult),
          );
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
    "returns deep-equal results with distinct identities on repeated evaluation",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { x } from "./missing";',
        },
        { applicable: true },
      );

      try {
        const again = evaluateRevUnres001(context, { applicable: true });

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
    "does not mutate the derivation result or context-owned state",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { x } from "./missing";',
        },
        { applicable: true },
      );

      try {
        const beforeEdges = JSON.stringify(context.allModuleEdges());
        const beforeResult = JSON.stringify(result);
        const sourceNames = context
          .allModuleEdges()
          .find((edge) => edge.rawSpecifier === "./missing")?.importedNames;

        expect(result.violations).toHaveLength(1);
        expect(JSON.stringify(context.allModuleEdges())).toBe(beforeEdges);
        expect(result.violations[0]?.importedNames).not.toBe(sourceNames);

        const again = evaluateRevUnres001(context, { applicable: true });

        expect(JSON.stringify(again)).toBe(beforeResult);
        expect(JSON.stringify(context.allModuleEdges())).toBe(beforeEdges);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "exposes exactly the five locked evidence keys",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { x } from "./missing";',
        },
        { applicable: true },
      );

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
    "exposes the exact field values for every supported via form",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'import "./m-import";\nexport { x } from "./m-export-from";\nexport * from "./m-export-star";\nexport * as ns from "./m-namespace";',
        },
        { applicable: true },
      );

      try {
        expect(
          result.violations.map((violation) => ({
            rawSpecifier: violation.rawSpecifier,
            kind: violation.kind,
            via: violation.via,
            source: violation.source,
          })),
        ).toEqual([
          {
            rawSpecifier: "./m-export-from",
            kind: "unresolved",
            via: "export-from",
            source: "src/a.ts",
          },
          {
            rawSpecifier: "./m-export-star",
            kind: "unresolved",
            via: "export-star",
            source: "src/a.ts",
          },
          {
            rawSpecifier: "./m-import",
            kind: "unresolved",
            via: "import",
            source: "src/a.ts",
          },
          {
            rawSpecifier: "./m-namespace",
            kind: "unresolved",
            via: "re-export-namespace",
            source: "src/a.ts",
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "carries no target, location, severity, or remediation field",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import { x } from "./missing";',
        },
        { applicable: true },
      );

      try {
        const keys = Object.keys(result.violations[0] as object);

        for (const forbidden of [
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
          "file",
        ]) {
          expect(keys).not.toContain(forbidden);
        }
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a relative specifier naming a non-program asset",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts": 'import "./styles.css";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          source: "src/a.ts",
          rawSpecifier: "./styles.css",
          kind: "unresolved",
          via: "import",
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports nothing for a dynamic import because the substrate emits no module edge for it",
    () => {
      // extractModuleEdges visits only ImportDeclaration and
      // ExportDeclaration nodes, so `import("./missing")` produces no
      // ModuleEdge at all. REV-UNRES-001 therefore cannot observe it.
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'export async function load() {\n  return import("./missing");\n}',
        },
        { applicable: true },
      );

      try {
        expect(
          context.allModuleEdges().filter((edge) => edge.rawSpecifier === "./missing"),
        ).toHaveLength(0);
        expect(result).toEqual({ evaluated: true, violations: [] });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports nothing for require because the substrate emits no module edge for it",
    () => {
      // CommonJS require is likewise not extracted by extractModuleEdges,
      // so no ModuleEdge exists and nothing is reported.
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'const key = "missing";\nexport const loaded = require("./" + key);',
        },
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
    "reports an unresolved type-only re-export",
    () => {
      const { context, result } = evaluate(
        {
          "src/a.ts":
            'export type { Missing } from "./missing";\nexport type Other = Missing;',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]).toMatchObject({
          rawSpecifier: "./missing",
          kind: "unresolved",
          via: "export-from",
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "orders violations by source, rawSpecifier, via, kind, then imported names",
    () => {
      const { context, result } = evaluate(
        {
          "src/b.ts": 'import "./shared";',
          "src/a.ts":
            'export * from "./shared";\nimport { b } from "./shared";\nimport "./shared";\nimport { a } from "./shared";\nimport "./aaa";',
        },
        { applicable: true },
      );

      try {
        expect(result.violations).toHaveLength(6);
        expect(
          result.violations.map(
            (violation) =>
              `${violation.source}|${violation.rawSpecifier}|${violation.via}|${violation.kind}|${(
                violation.importedNames ?? []
              ).join(",")}`,
          ),
        ).toEqual([
          "src/a.ts|./aaa|import|unresolved|",
          "src/a.ts|./shared|export-star|unresolved|",
          "src/a.ts|./shared|import|unresolved|",
          "src/a.ts|./shared|import|unresolved|a",
          "src/a.ts|./shared|import|unresolved|b",
          "src/b.ts|./shared|import|unresolved|",
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );
});
