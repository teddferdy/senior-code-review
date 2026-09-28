import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";

describe("module edges", () => {
  it(
    "records runtime import edges with resolved targets",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "consumer.ts": 'import { a } from "./a";',
          "a.ts": "export const a = 1;",
        },
      });

      const edges = context.moduleEdgesOf("consumer.ts");

      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        from: "consumer.ts",
        to: "a.ts",
        rawSpecifier: "./a",
        kind: "runtime",
        via: "import",
      });
      expect(edges[0].importedNames).toEqual(["a"]);

      context.dispose();
    },
    30000,
  );

  it(
    "records side-effect imports as runtime edges",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "main.ts": 'import "./setup";',
          "setup.ts": "export const ready = true;",
        },
      });

      const edges = context.moduleEdgesOf("main.ts");

      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        from: "main.ts",
        to: "setup.ts",
        kind: "runtime",
        via: "import",
      });

      context.dispose();
    },
    30000,
  );

  it(
    "records named and star re-export relationships",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "helper.ts": "export function helper() {}",
          "extra.ts": "export function extra() {}",
          "index.ts": `export { helper } from "./helper";
export * from "./extra";
export * as ns from "./helper";
`,
        },
      });

      const edges = context.moduleEdgesOf("index.ts");
      const byVia = new Map(edges.map((edge) => [edge.via, edge]));

      expect(byVia.get("export-from")).toMatchObject({
        from: "index.ts",
        to: "helper.ts",
        kind: "runtime",
      });
      expect(byVia.get("export-star")).toMatchObject({
        from: "index.ts",
        to: "extra.ts",
        kind: "runtime",
      });
      expect(byVia.get("re-export-namespace")).toMatchObject({
        from: "index.ts",
        to: "helper.ts",
        kind: "runtime",
      });

      context.dispose();
    },
    30000,
  );

  it(
    "distinguishes type-only imports and exports",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "types.ts": "export interface Config { debug: boolean; }",
          "value.ts": "export const value = 1;",
          "consumer.ts": `import type { Config } from "./types";
import { value } from "./value";
`,
          "barrel.ts": `export type { Config } from "./types";
export { value } from "./value";
`,
        },
      });

      const consumerEdges = context.moduleEdgesOf("consumer.ts");
      const typeEdge = consumerEdges.find(
        (edge) => edge.rawSpecifier === "./types",
      );
      const valueEdge = consumerEdges.find(
        (edge) => edge.rawSpecifier === "./value",
      );

      expect(typeEdge?.kind).toBe("type-only");
      expect(typeEdge?.to).toBe("types.ts");
      expect(valueEdge?.kind).toBe("runtime");

      const barrelEdges = context.moduleEdgesOf("barrel.ts");
      const barrelType = barrelEdges.find(
        (edge) => edge.rawSpecifier === "./types",
      );
      const barrelValue = barrelEdges.find(
        (edge) => edge.rawSpecifier === "./value",
      );

      expect(barrelType?.kind).toBe("type-only");
      expect(barrelType?.via).toBe("export-from");
      expect(barrelValue?.kind).toBe("runtime");

      context.dispose();
    },
    30000,
  );

  it(
    "marks unresolved relative and external specifiers distinctly",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "consumer.ts": `import { missing } from "./missing";
import { lodash } from "lodash";
`,
        },
      });

      const edges = context.moduleEdgesOf("consumer.ts");
      const unresolved = edges.find(
        (edge) => edge.rawSpecifier === "./missing",
      );
      const external = edges.find(
        (edge) => edge.rawSpecifier === "lodash",
      );

      expect(unresolved).toMatchObject({
        kind: "unresolved",
        to: null,
        via: "import",
      });
      expect(external).toMatchObject({
        kind: "external",
        to: null,
        via: "import",
      });

      context.dispose();
    },
    30000,
  );

  it(
    "keeps ambiguous star re-exports as edges without alias targets",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export const shared = 1;",
          "b.ts": "export const shared = 2;",
          "index.ts": `export * from "./a";
export * from "./b";
`,
        },
      });

      const edges = context.moduleEdgesOf("index.ts");

      expect(edges).toHaveLength(2);
      expect(
        edges.every((edge) => edge.via === "export-star"),
      ).toBe(true);

      const starAliases = context
        .allAliases()
        .filter((alias) => alias.via === "export-star");

      expect(starAliases).toHaveLength(2);
      expect(
        starAliases.every(
          (alias) => alias.targetSymbolId === undefined,
        ),
      ).toBe(true);

      context.dispose();
    },
    30000,
  );
});
