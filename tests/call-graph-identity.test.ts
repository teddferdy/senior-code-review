import { describe, expect, it } from "vitest";

import { AnalysisContext } from "../src/repository/analysis-context.js";
import {
  buildCallGraph,
  type CallGraph,
} from "../src/repository/call-graph.js";
import { correlateCallGraph } from "../src/repository/call-graph-identity.js";

function correlatedFor(sources: Record<string, string>) {
  const graph = buildCallGraph(sources);
  const context = new AnalysisContext({
    repositoryRoot: "/repo",
    sources,
  });
  const identity = correlateCallGraph(context, graph);

  return { graph, context, identity };
}

describe("call graph identity correlation", () => {
  it(
    "correlates a direct caller-to-callee edge without changing the graph",
    () => {
      const sources = {
        "foo.ts": `
export function foo() {}
`,
        "consumer.ts": `
import { foo } from "./foo";

export function consumer() {
  foo();
}
`,
      };

      const { graph, context, identity } = correlatedFor(sources);

      // Legacy output is byte-identical to the standalone builder.
      expect(graph).toEqual(buildCallGraph(sources));
      expect(graph.edges).toHaveLength(1);

      const [edge] = graph.edges;

      expect(identity.graph).toBe(graph);
      expect(identity.callerIds.get(edge)).toBeDefined();
      expect(identity.calleeIds.get(edge)).toBeDefined();
      expect(identity.calleeSymbols.get(edge)).toBeDefined();

      const calleeId = identity.calleeIds.get(edge)!;
      const callee = context.declarationOf(calleeId)!;

      expect(callee.file).toBe("foo.ts");
      expect(callee.name).toBe("foo");

      const callerId = identity.callerIds.get(edge)!;
      const caller = context.declarationOf(callerId)!;

      expect(caller.file).toBe("consumer.ts");
      expect(caller.name).toBe("consumer");

      expect(context.symbolOf(callee.symbolId)?.id).toBe(
        identity.calleeSymbols.get(edge),
      );

      context.dispose();
    },
    30000,
  );

  it(
    "correlates barrel re-export callees to the original declaration",
    () => {
      const sources = {
        "helper.ts": `
export function helper() {}
`,
        "index.ts": `
export { helper } from "./helper";
`,
        "consumer.ts": `
import { helper } from "./index";

export function consumer() {
  helper();
}
`,
      };

      const { context, identity, graph } = correlatedFor(sources);

      expect(graph.edges).toHaveLength(1);

      const [edge] = graph.edges;
      const callee = context.declarationOf(
        identity.calleeIds.get(edge)!,
      )!;

      expect(callee.file).toBe("helper.ts");
      expect(callee.name).toBe("helper");

      context.dispose();
    },
    30000,
  );

  it(
    "correlates interface dispatch and wrapper callees",
    () => {
      const sources = {
        "service.ts": `
export interface Runner {
  run(): void;
}

export class Service implements Runner {
  run(): void {}
}
`,
        "consumer.ts": `
import { Service } from "./service";

export function consumer() {
  const service = new Service();
  (service.run)();
}
`,
      };

      const { context, identity, graph } = correlatedFor(sources);

      expect(graph.edges.length).toBeGreaterThan(0);

      for (const edge of graph.edges) {
        const calleeId = identity.calleeIds.get(edge);

        // Correlation never guesses: entries are either exact or absent.
        if (calleeId !== undefined) {
          expect(context.declarationOf(calleeId)).toBeDefined();
        }
      }

      const runEdges = graph.edges.filter(
        (edge) => edge.callee.symbolName === "run",
      );

      expect(runEdges.length).toBeGreaterThan(0);

      const correlated = runEdges.filter((edge) =>
        identity.calleeIds.has(edge),
      );

      expect(correlated.length).toBeGreaterThan(0);

      context.dispose();
    },
    30000,
  );

  it(
    "represents unresolvable nodes safely without guessing",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "a.ts": "export function alpha() {}",
        },
      });

      expect(
        context.resolveDeclaration({
          symbolName: "missing",
          filePath: "a.ts",
          line: 1,
        }),
      ).toBeUndefined();

      expect(
        context.resolveDeclaration({
          symbolName: "alpha",
          filePath: "outside.ts",
          line: 1,
        }),
      ).toBeUndefined();

      const phantomGraph: CallGraph = {
        edges: [
          {
            caller: { symbolName: "alpha", filePath: "a.ts", line: 1 },
            callee: { symbolName: "ghost", filePath: "a.ts", line: 1 },
            callSite: { filePath: "a.ts", line: 1 },
          },
        ],
      };

      const identity = correlateCallGraph(context, phantomGraph);

      expect(identity.callerIds.size).toBe(1);
      expect(identity.calleeIds.size).toBe(0);
      expect(identity.calleeSymbols.size).toBe(0);

      context.dispose();
    },
    30000,
  );
});
