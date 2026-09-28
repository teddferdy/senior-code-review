import ts from "typescript";
import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";

describe("analysis context construction", () => {
  it(
    "builds an empty context with a valid program",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {},
      });

      expect(context.canonicalPaths).toEqual([]);
      expect(context.hasSource("a.ts")).toBe(false);
      expect(context.getSource("a.ts")).toBeUndefined();
      expect(context.program).toBeDefined();
      expect(context.checker).toBeDefined();
      expect(context.allModuleEdges()).toEqual([]);
      expect(context.allDeclarations()).toEqual([]);

      context.dispose();
    },
    30000,
  );

  it(
    "copies source input so later mutation has no effect",
    () => {
      const sources: Record<string, string> = {
        "a.ts": "export function original() {}",
      };

      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources,
      });

      sources["evil.ts"] = "export function evil() {}";
      sources["a.ts"] = "export function mutated() {}";

      expect(context.hasSource("evil.ts")).toBe(false);
      expect(context.getSource("a.ts")).toBe(
        "export function original() {}",
      );

      context.dispose();
    },
    30000,
  );

  it(
    "keeps unsupported files accessible but outside program roots",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export function a() {}",
          "data.json": '{"key": "value"}',
          "README.md": "# docs",
        },
      });

      expect(context.hasSource("data.json")).toBe(true);
      expect(context.hasSource("README.md")).toBe(true);
      expect(context.getSource("data.json")).toContain("key");

      const declaredFiles = new Set(
        context.allDeclarations().map((record) => record.file),
      );

      expect(declaredFiles.has("data.json")).toBe(false);
      expect(declaredFiles.has("README.md")).toBe(false);
      expect(declaredFiles.has("a.ts")).toBe(true);

      context.dispose();
    },
    30000,
  );

  it(
    "locks compiler options to the V1 policy",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: { "a.ts": "export const a = 1;" },
      });

      expect(context.compilerOptions.target).toBe(ts.ScriptTarget.Latest);
      expect(context.compilerOptions.module).toBe(ts.ModuleKind.CommonJS);
      expect(context.compilerOptions.moduleResolution).toBe(
        ts.ModuleResolutionKind.NodeJs,
      );
      expect(context.compilerOptions.strict).toBe(true);

      context.dispose();
    },
    30000,
  );

  it(
    "ignores repository tsconfig content",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export const a = 1;",
          "tsconfig.json": JSON.stringify({
            compilerOptions: { strict: false, target: "es5" },
          }),
        },
      });

      // The tsconfig file is carried as bytes but never honored.
      expect(context.hasSource("tsconfig.json")).toBe(true);
      expect(context.compilerOptions.strict).toBe(true);
      expect(context.compilerOptions.target).toBe(ts.ScriptTarget.Latest);

      context.dispose();
    },
    30000,
  );

  it(
    "leaves path aliases unresolved as external edges",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "consumer.ts": 'import { a } from "@/a";',
          "a.ts": "export const a = 1;",
        },
      });

      const edges = context.moduleEdgesOf("consumer.ts");

      expect(edges).toHaveLength(1);
      expect(edges[0].rawSpecifier).toBe("@/a");
      expect(edges[0].kind).toBe("external");
      expect(edges[0].to).toBeNull();

      context.dispose();
    },
    30000,
  );

  it(
    "supports dispose semantics with safe double-dispose",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: { "a.ts": "export const a = 1;" },
      });

      expect(context.canonicalPaths).toEqual(["a.ts"]);

      context.dispose();
      context.dispose();

      expect(() => context.canonicalPaths).toThrow();
      expect(() => context.getSource("a.ts")).toThrow();
      expect(() => context.hasSource("a.ts")).toThrow();
      expect(() => context.program).toThrow();
      expect(() => context.checker).toThrow();
      expect(() => context.compilerOptions).toThrow();
      expect(() => context.moduleEdgesOf("a.ts")).toThrow();
      expect(() => context.toCanonical("a.ts")).toThrow();
    },
    30000,
  );

  it(
    "derives absolute and virtual paths from canonical paths",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: { "src/a.ts": "export const a = 1;" },
      });

      expect(context.toVirtualPath("src/a.ts")).toBe(
        "/__senior_code_reviewer__/src/a.ts",
      );
      expect(context.toAbsolute("src/a.ts").endsWith("src/a.ts")).toBe(true);
      expect(context.toCanonical("./src/a.ts")).toBe("src/a.ts");
      expect(context.toCanonical("../outside.ts")).toBeUndefined();

      context.dispose();
    },
    30000,
  );
});
