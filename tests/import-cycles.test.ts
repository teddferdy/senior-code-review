import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";
import { analyzeImportCycles } from "../src/repository/import-cycles.js";

function analyze(sources: Record<string, string>) {
  const context = new AnalysisContext({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return {
      cycles: analyzeImportCycles(context),
      edges: context.allModuleEdges(),
    };
  } finally {
    context.dispose();
  }
}

describe("import cycles", () => {
  it(
    "reports a two-node cycle as one closed canonical path",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports a three-node cycle as one closed canonical path",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./c";\nexport const b = 2;',
        "src/c.ts": 'import "./a";\nexport const c = 3;',
      });

      expect(cycles).toEqual([
        ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"],
      ]);
    },
    30000,
  );

  it(
    "returns no cycles for an acyclic graph",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./c";\nexport const b = 2;',
        "src/c.ts": "export const c = 3;",
      });

      expect(cycles).toEqual([]);
    },
    30000,
  );

  it(
    "reports only the cyclic component of a disconnected graph",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/c.ts": 'import "./d";\nexport const c = 3;',
        "src/d.ts": "export const d = 4;",
        "src/lonely.ts": "export const lonely = 5;",
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "does not traverse external edges",
    () => {
      const { cycles } = analyze({
        "src/a.ts":
          'import "some-package";\nimport "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/c.ts": 'import "other-package";\nexport const c = 3;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "does not traverse unresolved edges",
    () => {
      const { cycles } = analyze({
        "src/a.ts":
          'import "./missing";\nimport "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/d.ts": 'import "./gone";\nexport const d = 4;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "collapses duplicate parallel edges into a single cycle",
    () => {
      const { cycles, edges } = analyze({
        "src/a.ts":
          'import "./b";\nimport "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
      });

      expect(
        edges.filter((edge) => edge.from === "src/a.ts" && edge.to === "src/b.ts"),
      ).toHaveLength(2);
      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "produces byte-identical output regardless of source insertion order",
    () => {
      const first = analyze({
        "src/e.ts": 'import "./a";\nexport const e = 5;',
        "src/d.ts": 'import "./c";\nexport const d = 4;',
        "src/c.ts": 'import "./d";\nexport const c = 3;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/a.ts": 'import "./b";\nexport const a = 1;',
      }).cycles;

      const second = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/c.ts": 'import "./d";\nexport const c = 3;',
        "src/d.ts": 'import "./c";\nexport const d = 4;',
        "src/e.ts": 'import "./a";\nexport const e = 5;',
      }).cycles;

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(second).toEqual([
        ["src/a.ts", "src/b.ts", "src/a.ts"],
        ["src/c.ts", "src/d.ts", "src/c.ts"],
      ]);
    },
    30000,
  );

  it(
    "ignores self-imports while keeping the underlying edge",
    () => {
      const { cycles, edges } = analyze({
        "src/a.ts": 'import "./a";\nexport const a = 1;',
      });

      expect(cycles).toEqual([]);
      expect(
        edges.filter((edge) => edge.from === "src/a.ts" && edge.to === "src/a.ts"),
      ).toHaveLength(1);
    },
    30000,
  );

  it(
    "reports a pure type-only cycle",
    () => {
      const { cycles } = analyze({
        "src/a.ts":
          'import type { B } from "./b";\nexport type A = B | number;',
        "src/b.ts":
          'import type { A } from "./a";\nexport type B = A | string;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports a mixed runtime and type-only cycle as one cycle",
    () => {
      const { cycles, edges } = analyze({
        "src/a.ts": 'import { b } from "./b";\nexport const a = b;',
        "src/b.ts":
          'import type { A } from "./a";\nexport type B = A | string;',
      });

      expect(
        edges.find((edge) => edge.from === "src/b.ts")?.kind,
      ).toBe("type-only");
      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports a barrel export-from cycle",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'export { b } from "./b";\nexport const a = 1;',
        "src/b.ts": 'export { a } from "./a";\nexport const b = 2;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports an export-star cycle",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'export * from "./b";\nexport const a = 1;',
        "src/b.ts": 'export * from "./a";\nexport const b = 2;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports a re-export-namespace cycle",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'export * as b from "./b";\nexport const a = 1;',
        "src/b.ts": 'export * as a from "./a";\nexport const b = 2;',
      });

      expect(cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
    },
    30000,
  );

  it(
    "reports multiple independent cycles in deterministic order",
    () => {
      const { cycles } = analyze({
        "src/a.ts": 'import "./b";\nexport const a = 1;',
        "src/b.ts": 'import "./a";\nexport const b = 2;',
        "src/c.ts": 'import "./d";\nexport const c = 3;',
        "src/d.ts": 'import "./c";\nexport const d = 4;',
      });

      expect(cycles).toEqual([
        ["src/a.ts", "src/b.ts", "src/a.ts"],
        ["src/c.ts", "src/d.ts", "src/c.ts"],
      ]);
    },
    30000,
  );
});
