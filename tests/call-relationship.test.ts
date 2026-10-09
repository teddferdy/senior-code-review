import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import { resolveCallModuleEdges } from "../src/repository/call-module-edges.js";
import {
  resolveCallRelationship,
  type CallRelationship,
} from "../src/repository/call-relationship.js";
import type {
  CanonicalPath,
  DeclarationId,
} from "../src/repository/declaration-ids.js";
import type { ModuleEdge } from "../src/repository/module-edges.js";
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

function fabricatedEdge(
  callerId: DeclarationId,
  calleeId: DeclarationId,
): V1CallEdge {
  return {
    callerId,
    calleeId,
    callSite: { file: "src/a.ts" as CanonicalPath, line: 1 },
  };
}

const MISSING_ID = "decl:missing:0-0:function:missing#0" as DeclarationId;

describe("resolveCallRelationship", () => {
  it("T1 returns undefined for an unresolved caller", () => {
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
      const calleeId = idOf(context, "src/b.ts", "bar", "function");
      const edge = fabricatedEdge(MISSING_ID, calleeId);

      expect(resolveCallRelationship(context, edge)).toBeUndefined();
    } finally {
      finish(context);
    }
  }, 30000);

  it("T2 returns undefined for an unresolved callee", () => {
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
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const edge = fabricatedEdge(callerId, MISSING_ID);

      expect(resolveCallRelationship(context, edge)).toBeUndefined();
    } finally {
      finish(context);
    }
  }, 30000);

  it("T3 returns endpoints with [] for a same-file call", () => {
    const { context, graph } = setup({
      "src/a.ts": `export function bar() {}
export function foo() {
  bar();
}
`,
    });

    try {
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const calleeId = idOf(context, "src/a.ts", "bar", "function");
      const edge = edgeOf(graph, callerId, calleeId);

      const result = resolveCallRelationship(context, edge);

      expect(result).toBeDefined();
      expect(result?.caller).toBe(context.declarationOf(callerId));
      expect(result?.callee).toBe(context.declarationOf(calleeId));
      expect(result?.moduleEdges).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("T4 returns endpoint and edge identity for a direct call", () => {
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
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const calleeId = idOf(context, "src/b.ts", "bar", "function");
      const edge = edgeOf(graph, callerId, calleeId);
      const expected = tableEdge(context, "src/a.ts", "src/b.ts");

      const result = resolveCallRelationship(context, edge);

      expect(result).toBeDefined();
      expect(result?.caller).toBe(context.declarationOf(callerId));
      expect(result?.callee).toBe(context.declarationOf(calleeId));
      expect(result?.moduleEdges).toHaveLength(1);
      expect(result?.moduleEdges[0]).toBe(expected);
    } finally {
      finish(context);
    }
  }, 30000);

  it("T5 preserves every duplicate direct edge with identity", () => {
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
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const calleeId = idOf(context, "src/b.ts", "x", "function");
      const edge = edgeOf(graph, callerId, calleeId);

      const table = context
        .allModuleEdges()
        .filter((entry) => entry.from === "src/a.ts" && entry.to === "src/b.ts");
      expect(table.length).toBeGreaterThan(1);

      const result = resolveCallRelationship(context, edge);

      expect(result).toBeDefined();
      expect(result?.moduleEdges).toHaveLength(table.length);
      result?.moduleEdges.forEach((entry, index) => {
        expect(entry).toBe(table[index] as ModuleEdge);
      });
    } finally {
      finish(context);
    }
  }, 30000);

  it("T6 returns endpoints and chain identity for a barrel call", () => {
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
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const calleeId = idOf(context, "src/b.ts", "bar", "function");
      const edge = edgeOf(graph, callerId, calleeId);

      const result = resolveCallRelationship(context, edge);

      expect(result).toBeDefined();
      expect(result?.caller).toBe(context.declarationOf(callerId));
      expect(result?.callee).toBe(context.declarationOf(calleeId));
      expect(result?.moduleEdges.map((entry) => [entry.from, entry.to])).toEqual([
        ["src/a.ts", "src/barrel.ts"],
        ["src/barrel.ts", "src/b.ts"],
      ]);
      expect(result?.moduleEdges[0]).toBe(
        tableEdge(context, "src/a.ts", "src/barrel.ts"),
      );
      expect(result?.moduleEdges[1]).toBe(
        tableEdge(context, "src/barrel.ts", "src/b.ts"),
      );
    } finally {
      finish(context);
    }
  }, 30000);

  it("T7 returns a relationship with [] when no module chain exists", () => {
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
      const callerId = idOf(context, "src/a.ts", "foo", "function");
      const calleeId = idOf(context, "src/c.ts", "x", "function");
      const edge = edgeOf(graph, callerId, calleeId);

      const result: CallRelationship | undefined = resolveCallRelationship(
        context,
        edge,
      );

      expect(result).toBeDefined();
      expect(result).not.toBeUndefined();
      expect(result?.caller).toBe(context.declarationOf(callerId));
      expect(result?.callee).toBe(context.declarationOf(calleeId));
      expect(result?.moduleEdges).toEqual([]);
    } finally {
      finish(context);
    }
  }, 30000);

  it("T8 leaves the input V1CallEdge unchanged", () => {
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
      const before = JSON.stringify(edge);

      resolveCallRelationship(context, edge);

      expect(JSON.stringify(edge)).toBe(before);
    } finally {
      finish(context);
    }
  }, 30000);

  it("T9 matches resolveCallModuleEdges element-wise with identity", () => {
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

      const result = resolveCallRelationship(context, edge);
      const delegated = resolveCallModuleEdges(context, edge);

      expect(result).toBeDefined();
      expect(result?.moduleEdges).toHaveLength(delegated.length);
      result?.moduleEdges.forEach((entry, index) => {
        expect(entry).toBe(delegated[index] as ModuleEdge);
      });
    } finally {
      finish(context);
    }
  }, 30000);

  it("T10 is deterministic across repeated calls", () => {
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

      const once = resolveCallRelationship(context, edge);
      const twice = resolveCallRelationship(context, edge);

      expect(once).toBeDefined();
      expect(twice).toBeDefined();
      expect(twice?.caller).toBe(once?.caller as object);
      expect(twice?.callee).toBe(once?.callee as object);
      expect(twice?.moduleEdges).toHaveLength(once?.moduleEdges.length ?? -1);
      twice?.moduleEdges.forEach((entry, index) => {
        expect(entry).toBe(once?.moduleEdges[index] as ModuleEdge);
      });
    } finally {
      finish(context);
    }
  }, 30000);
});
