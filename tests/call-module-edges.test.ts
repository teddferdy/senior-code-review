import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
} from "../src/repository/declaration-ids.js";
import type { ModuleEdge } from "../src/repository/module-edges.js";
import { resolveCallModuleEdges } from "../src/repository/call-module-edges.js";
import type { V1CallEdge } from "../src/repository/v1-call-graph.js";
import {
  buildV1CallGraph,
  type V1CallGraph,
} from "../src/repository/v1-call-graph.js";

function setup(sources: Record<string, string>): {
  context: AnalysisContext;
  graph: V1CallGraph;
} {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, graph: buildV1CallGraph(context) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

function idOf(
  context: AnalysisContext,
  file: string,
  name: string,
  kind?: string,
): DeclarationId {
  const found = context
    .allDeclarations()
    .find(
      (record) =>
        record.file === file &&
        record.name === name &&
        (kind === undefined || record.kind === kind),
    );

  if (!found) {
    throw new Error(`missing declaration ${kind ?? "?"} ${name} in ${file}`);
  }

  return found.id;
}

function edgeOf(
  graph: V1CallGraph,
  callerId: DeclarationId,
  calleeId: DeclarationId,
): V1CallEdge {
  const found = graph.edges.find(
    (edge) => edge.callerId === callerId && edge.calleeId === calleeId,
  );

  if (!found) {
    throw new Error("missing expected V1 call edge");
  }

  return found;
}

function tableEdge(
  context: AnalysisContext,
  from: string,
  to: string,
): ModuleEdge {
  const found = context
    .allModuleEdges()
    .find((edge) => edge.from === from && edge.to === to);

  if (!found) {
    throw new Error(`missing module edge ${from} -> ${to}`);
  }

  return found;
}

describe("resolveCallModuleEdges", () => {
  it("returns [] for a same-file call", () => {
    const { context, graph } = setup({
      "src/a.ts": `export function bar() {}
export function foo() {
  bar();
}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/a.ts", "bar", "function"),
      );

      expect(resolveCallModuleEdges(context, edge)).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns [] for a same-file call even with a degenerate self-edge", () => {
    const { context, graph } = setup({
      "src/a.ts": `import "./a";
export function bar() {}
export function foo() {
  bar();
}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/a.ts", "bar", "function"),
      );

      expect(resolveCallModuleEdges(context, edge)).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns the direct module edge for a direct cross-file call", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { bar } from "./b";
export function foo() {
  bar();
}
`,
      "src/b.ts": `export function bar() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "bar", "function"),
      );
      const expected = tableEdge(context, "src/a.ts", "src/b.ts");

      const result = resolveCallModuleEdges(context, edge);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(expected);
      expect(result[0]?.from).toBe("src/a.ts");
      expect(result[0]?.to).toBe("src/b.ts");
      expect(result[0]?.via).toBe("import");
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns every duplicate direct edge in table order without dedup", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { x } from "./b";
import { y } from "./b";
export function foo() {
  x();
}
`,
      "src/b.ts": `export function x() {}
export function y() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "x", "function"),
      );

      const table = context
        .allModuleEdges()
        .filter((entry) => entry.from === "src/a.ts" && entry.to === "src/b.ts");
      expect(table.length).toBeGreaterThan(1);

      const result = resolveCallModuleEdges(context, edge);

      expect(result).toHaveLength(table.length);
      expect(result).toEqual(table);
      result.forEach((entry, index) => {
        expect(entry).toBe(table[index] as ModuleEdge);
      });
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns the full chain for a barrel-mediated call", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { bar } from "./barrel";
export function foo() {
  bar();
}
`,
      "src/barrel.ts": `export { bar } from "./b";
`,
      "src/b.ts": `export function bar() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "bar", "function"),
      );

      const result = resolveCallModuleEdges(context, edge);

      expect(result.map((entry) => [entry.from, entry.to])).toEqual([
        ["src/a.ts", "src/barrel.ts"],
        ["src/barrel.ts", "src/b.ts"],
      ]);
      expect(result[0]).toBe(tableEdge(context, "src/a.ts", "src/barrel.ts"));
      expect(result[1]).toBe(tableEdge(context, "src/barrel.ts", "src/b.ts"));
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns the complete ordered chain for multi-hop re-exports", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { bar } from "./b1";
export function foo() {
  bar();
}
`,
      "src/b1.ts": `export { bar } from "./b2";
`,
      "src/b2.ts": `export { bar } from "./b";
`,
      "src/b.ts": `export function bar() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "bar", "function"),
      );

      const result = resolveCallModuleEdges(context, edge);

      expect(result.map((entry) => [entry.from, entry.to])).toEqual([
        ["src/a.ts", "src/b1.ts"],
        ["src/b1.ts", "src/b2.ts"],
        ["src/b2.ts", "src/b.ts"],
      ]);
      expect(result[result.length - 1]?.to).toBe("src/b.ts");
    } finally {
      finish(context);
    }
  }, 30000);

  it("never follows an unrelated re-export leg", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { target } from "./barrel";
export function foo() {
  target();
}
`,
      "src/barrel.ts": `export { target } from "./b";
export { decoy } from "./c";
`,
      "src/b.ts": `export function target() {}
`,
      "src/c.ts": `export function decoy() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "target", "function"),
      );

      const result = resolveCallModuleEdges(context, edge);

      expect(result.map((entry) => [entry.from, entry.to])).toEqual([
        ["src/a.ts", "src/barrel.ts"],
        ["src/barrel.ts", "src/b.ts"],
      ]);
      expect(result.some((entry) => entry.to === "src/c.ts")).toBe(false);
    } finally {
      finish(context);
    }
  }, 30000);

  it("returns [] when no internal chain reaches the callee", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { x } from "./b";
export function foo() {
  x();
}
`,
      "src/b.ts": `import { x } from "./c";
export { x };
`,
      "src/c.ts": `export function x() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/c.ts", "x", "function"),
      );

      expect(resolveCallModuleEdges(context, edge)).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("never returns external edges and tolerates stale ids", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { bar } from "./b";
import { join } from "node:path";
export function foo() {
  bar();
  join("x", "y");
}
`,
      "src/b.ts": `export function bar() {}
`,
    });

    try {
      const edge = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "bar", "function"),
      );

      const result = resolveCallModuleEdges(context, edge);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((entry) => entry.to !== null)).toBe(true);

      const stale: V1CallEdge = {
        callerId: "decl:missing:0-0:function:missing#0" as DeclarationId,
        calleeId: edge.calleeId,
        callSite: { file: "src/a.ts" as CanonicalPath, line: 1 },
      };
      expect(resolveCallModuleEdges(context, stale)).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("resolves multiple calls over one dependency to the same edge", () => {
    const { context, graph } = setup({
      "src/a.ts": `import { x, y } from "./b";
export function foo() {
  x();
}
export function bar() {
  y();
}
`,
      "src/b.ts": `export function x() {}
export function y() {}
`,
    });

    try {
      const first = edgeOf(
        graph,
        idOf(context, "src/a.ts", "foo", "function"),
        idOf(context, "src/b.ts", "x", "function"),
      );
      const second = edgeOf(
        graph,
        idOf(context, "src/a.ts", "bar", "function"),
        idOf(context, "src/b.ts", "y", "function"),
      );

      const firstResult = resolveCallModuleEdges(context, first);
      const secondResult = resolveCallModuleEdges(context, second);

      expect(firstResult).toEqual(secondResult);
      expect(firstResult[0]).toBe(secondResult[0] as ModuleEdge);
      expect(firstResult[0]).toBe(tableEdge(context, "src/a.ts", "src/b.ts"));
    } finally {
      finish(context);
    }
  }, 30000);

  it("is deterministic across repeated and reordered equivalent analyses", () => {
    const sources = {
      "src/a.ts": `import { target } from "./barrel";
export function foo() {
  target();
}
`,
      "src/barrel.ts": `export { target } from "./b";
export { decoy } from "./c";
`,
      "src/b.ts": `export function target() {}
`,
      "src/c.ts": `export function decoy() {}
`,
    };
    const reordered = {
      "src/c.ts": sources["src/c.ts"] as string,
      "src/b.ts": sources["src/b.ts"] as string,
      "src/barrel.ts": sources["src/barrel.ts"] as string,
      "src/a.ts": sources["src/a.ts"] as string,
    };

    const first = setup(sources);
    const second = setup(reordered);

    try {
      const firstEdge = edgeOf(
        first.graph,
        idOf(first.context, "src/a.ts", "foo", "function"),
        idOf(first.context, "src/b.ts", "target", "function"),
      );
      const secondEdge = edgeOf(
        second.graph,
        idOf(second.context, "src/a.ts", "foo", "function"),
        idOf(second.context, "src/b.ts", "target", "function"),
      );

      const once = resolveCallModuleEdges(first.context, firstEdge);
      const twice = resolveCallModuleEdges(first.context, firstEdge);
      expect(twice).toEqual(once);
      expect(twice).toHaveLength(once.length);
      twice.forEach((entry, index) => {
        expect(entry).toBe(once[index] as ModuleEdge);
      });

      const other = resolveCallModuleEdges(second.context, secondEdge);
      expect(other).toEqual(once);
    } finally {
      finish(first.context);
      finish(second.context);
    }
  }, 30000);
});
