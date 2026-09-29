import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { RevArch001Result } from "../src/repository/rev-arch-001.js";
import {
  REV_ARCH_001_BOUNDARY,
  evaluateRevArch001,
} from "../src/repository/rev-arch-001.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevArch001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevArch001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

describe("REV-ARCH-001 architectural dependency boundary", () => {
  it(
    "reports a runtime repository -> ui dependency as a violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
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
    "reports a type-only repository -> ui dependency as a violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import type { B } from "../ui/b";\nexport type A = B | null;',
          "src/ui/b.ts": "export interface B {\n  x: number;\n}",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.evidence.kind).toBe("type-only");
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an export-from repository -> ui dependency as a violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'export { b } from "../ui/b";\nexport const a = 1;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.evidence.via).toBe("export-from");
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports an export-star repository -> ui dependency as a violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'export * from "../ui/b";\nexport const a = 1;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.evidence.via).toBe("export-star");
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "reports a re-export-namespace repository -> ui dependency as a violation",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'export * as b from "../ui/b";\nexport const a = 1;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.evidence.via).toBe(
          "re-export-namespace",
        );
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces no violation for the reverse ui -> repository direction",
    () => {
      const { context, result } = evaluate(
        {
          "src/ui/a.ts":
            'import { b } from "../repository/b";\nexport const a = b;',
          "src/repository/b.ts": "export const b = 1;",
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
    "produces no violation for an unrelated repository dependency",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { s } from "../service/s";\nexport const a = s;',
          "src/service/s.ts": "export const s = 1;",
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
    "produces no violation for an external package dependency",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import "some-package";\nexport const a = 1;',
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
    "produces no violation for an unresolved dependency",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import "./missing";\nexport const a = 1;',
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
    "does not match src/repository-extra as a violation source",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository-extra/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
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
    "does not match src/ui-kit as a violation target",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui-kit/b";\nexport const a = b;',
          "src/ui-kit/b.ts": "export const b = 1;",
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
    "does not match src/uikit as a violation target",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../uikit/b";\nexport const a = b;',
          "src/uikit/b.ts": "export const b = 1;",
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
    "produces no violation for a transitive-only chain without a direct edge",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../shared/b";\nexport const a = b;',
          "src/shared/b.ts":
            'import { c } from "../ui/c";\nexport const b = c;',
          "src/ui/c.ts": "export const c = 1;",
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
    "keeps a repository test path eligible for violations",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.test.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0]?.source).toBe(
          "src/repository/a.test.ts",
        );
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "does not match nested monorepo repository -> ui scopes",
    () => {
      const { context, result } = evaluate(
        {
          "packages/foo/src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "packages/foo/src/ui/b.ts": "export const b = 1;",
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
    "evaluates when explicit applicability is declared",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
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
    "produces no evaluation when applicability is absent",
    () => {
      const { context, result } = evaluate({
        "src/repository/a.ts":
          'import { b } from "../ui/b";\nexport const a = b;',
        "src/ui/b.ts": "export const b = 1;",
      });

      try {
        expect(result.evaluated).toBe(false);
        expect(result.violations).toEqual([]);
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
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: false },
      );

      try {
        expect(result.evaluated).toBe(false);
        expect(result.violations).toEqual([]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "preserves source, target, and the exact boundary",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations[0]?.source).toBe("src/repository/a.ts");
        expect(result.violations[0]?.target).toBe("src/ui/b.ts");
        expect(result.violations[0]?.boundary).toBe(REV_ARCH_001_BOUNDARY);
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
    "preserves rawSpecifier, via, and kind from the ModuleEdge",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        expect(result.violations[0]?.evidence).toEqual({
          rawSpecifier: "../ui/b",
          via: "import",
          kind: "runtime",
        });
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "generates no synthetic evidence beyond existing ModuleEdges",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        expect(result.evaluated).toBe(true);
        const edges = context.allModuleEdges();
        expect(result.violations).toHaveLength(2);

        for (const violation of result.violations) {
          expect(
            edges.some(
              (edge) =>
                edge.from === violation.source &&
                edge.to === violation.target &&
                edge.rawSpecifier === violation.evidence.rawSpecifier &&
                edge.via === violation.evidence.via &&
                edge.kind === violation.evidence.kind,
            ),
          ).toBe(true);
        }
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "does not mutate the evaluated ModuleEdge objects",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'import { b } from "../ui/b";\nexport const a = b;',
          "src/ui/b.ts": "export const b = 1;",
        },
        { applicable: true },
      );

      try {
        const before = JSON.stringify(context.allModuleEdges());

        expect(result.evaluated).toBe(true);
        expect(result.violations).toHaveLength(1);
        expect(JSON.stringify(context.allModuleEdges())).toBe(before);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces identical ordering and values on repeated evaluation",
    () => {
      const sources = {
        "src/repository/z.ts":
          'import { b } from "../ui/b";\nexport const z = b;',
        "src/repository/a.ts":
          'import { zed } from "../ui/zed";\nimport { b } from "../ui/b";\nexport const a = [zed, b];',
        "src/ui/b.ts": "export const b = 1;",
        "src/ui/zed.ts": "export const zed = 2;",
      };

      const first = new AnalysisContextImpl({
        repositoryRoot: "/repo",
        sources,
      });

      try {
        const firstResult = evaluateRevArch001(first, { applicable: true });

        const second = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/ui/zed.ts": sources["src/ui/zed.ts"],
            "src/repository/a.ts": sources["src/repository/a.ts"],
            "src/ui/b.ts": sources["src/ui/b.ts"],
            "src/repository/z.ts": sources["src/repository/z.ts"],
          },
        });

        try {
          const secondResult = evaluateRevArch001(second, {
            applicable: true,
          });

          expect(secondResult).toEqual(firstResult);
          expect(
            secondResult.violations.map(
              (violation) => `${violation.source} -> ${violation.target}`,
            ),
          ).toEqual([
            "src/repository/a.ts -> src/ui/b.ts",
            "src/repository/a.ts -> src/ui/zed.ts",
            "src/repository/z.ts -> src/ui/b.ts",
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
    "produces no violation for dynamic import forms",
    () => {
      const { context, result } = evaluate(
        {
          "src/repository/a.ts":
            'export async function load(): Promise<unknown> {\n  return import("../ui/b");\n}',
          "src/ui/b.ts": "export const b = 1;",
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
});
