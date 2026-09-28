import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";

function sortedIds(context: AnalysisContext): string[] {
  return context.allDeclarations().map((record) => record.id);
}

describe("declaration identity determinism", () => {
  it(
    "produces identical IDs for identical sources with reordered keys",
    () => {
      const first = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "b.ts": "export function shared() {}",
          "a.ts": "export function alpha() {}",
          "dir/c.ts": "export class Thing { run() {} }",
        },
      });

      const second = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "dir/c.ts": "export class Thing { run() {} }",
          "a.ts": "export function alpha() {}",
          "b.ts": "export function shared() {}",
        },
      });

      expect(sortedIds(second)).toEqual(sortedIds(first));

      first.dispose();
      second.dispose();
    },
    30000,
  );

  it(
    "uses offsets rather than line numbers in identity",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export function alpha() {}",
        },
      });

      const [record] = context.allDeclarations();

      expect(record.id).toMatch(/^decl:a\.ts:\d+-\d+:\w+:alpha#0$/);
      expect(record.line).toBe(1);

      context.dispose();
    },
    30000,
  );
});

describe("same-name declaration separation", () => {
  it(
    "distinguishes same-name functions in different files",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export function shared() {}",
          "b.ts": "export function shared() {}",
        },
      });

      const records = context
        .allDeclarations()
        .filter((record) => record.name === "shared");

      expect(records).toHaveLength(2);

      const [first, second] = records;

      expect(first.id).not.toBe(second.id);
      expect(first.symbolId).not.toBe(second.symbolId);
      expect(first.file).not.toBe(second.file);

      context.dispose();
    },
    30000,
  );

  it(
    "distinguishes same-name methods in different classes",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "services.ts": `
export class ServiceA {
  run() {}
}

export class ServiceB {
  run() {}
}
`,
        },
      });

      const methods = context
        .allDeclarations()
        .filter((record) => record.name === "run");

      expect(methods).toHaveLength(2);
      expect(methods[0].id).not.toBe(methods[1].id);
      expect(methods[0].symbolId).not.toBe(methods[1].symbolId);
      expect(methods[0].qualifiedName).not.toBe(methods[1].qualifiedName);
      expect(methods[0].parentId).not.toBe(methods[1].parentId);

      context.dispose();
    },
    30000,
  );
});

describe("overload identity", () => {
  it(
    "shares one SymbolId across signatures with distinct DeclarationIds",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": `export function f(x: string): void;
export function f(x: number): void;
export function f(x: unknown): void {}
`,
        },
      });

      const overloads = context
        .allDeclarations()
        .filter((record) => record.name === "f")
        .sort((a, b) => a.overloadIndex - b.overloadIndex);

      expect(overloads).toHaveLength(3);
      expect(overloads.map((record) => record.overloadIndex)).toEqual([
        0, 1, 2,
      ]);

      const symbolIds = new Set(
        overloads.map((record) => record.symbolId),
      );

      expect(symbolIds.size).toBe(1);

      const ids = new Set(overloads.map((record) => record.id));

      expect(ids.size).toBe(3);
      expect(overloads[2].kind).toBe("function");
      expect(overloads[0].overloads).toHaveLength(3);

      context.dispose();
    },
    30000,
  );
});

describe("nested declarations and hierarchy", () => {
  it(
    "links nested functions to their parent with qualified names",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": `export function outer() {
  function inner() {}
}
`,
        },
      });

      const outer = context
        .allDeclarations()
        .find((record) => record.name === "outer");
      const inner = context
        .allDeclarations()
        .find((record) => record.name === "inner");

      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(inner!.qualifiedName).toBe("outer.inner");
      expect(inner!.parentId).toBe(outer!.id);
      expect(outer!.parentId).toBeNull();

      context.dispose();
    },
    30000,
  );

  it(
    "indexes interfaces and object methods with class member parents",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "types.ts": `export interface Service {
  handle(): void;
}
`,
          "service.ts": `export const service = {
  run() {},
};
export class Worker {
  onEvent = () => {};
}
`,
        },
      });

      const iface = context
        .allDeclarations()
        .find((record) => record.name === "Service");

      expect(iface?.kind).toBe("interface");

      const run = context
        .allDeclarations()
        .find((record) => record.name === "run");

      expect(run?.kind).toBe("objectMethod");
      expect(run?.qualifiedName).toBe("service.run");

      const handler = context
        .allDeclarations()
        .find((record) => record.name === "onEvent");

      expect(handler?.kind).toBe("property");
      expect(handler?.qualifiedName).toBe("Worker.onEvent");

      const worker = context
        .allDeclarations()
        .find((record) => record.name === "Worker");

      expect(handler?.parentId).toBe(worker?.id);

      context.dispose();
    },
    30000,
  );
});

describe("re-export identity", () => {
  it(
    "maps barrel re-exports to the original SymbolId without new declarations",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "helper.ts": "export function helper() {}",
          "index.ts": 'export { helper } from "./helper";',
        },
      });

      const helperRecords = context
        .allDeclarations()
        .filter((record) => record.name === "helper");

      // The barrel creates an alias, not a new declaration.
      expect(helperRecords).toHaveLength(1);
      expect(helperRecords[0].file).toBe("helper.ts");

      const aliases = context
        .allAliases()
        .filter((alias) => alias.via === "export-from");

      expect(aliases).toHaveLength(1);
      expect(aliases[0].fromFile).toBe("index.ts");
      expect(aliases[0].exportedName).toBe("helper");
      expect(aliases[0].targetSymbolId).toBe(helperRecords[0].symbolId);

      const symbol = context.symbolOf(helperRecords[0].symbolId);

      expect(symbol?.primaryDeclarationId).toBe(helperRecords[0].id);

      context.dispose();
    },
    30000,
  );
});
