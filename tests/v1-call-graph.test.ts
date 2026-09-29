import { describe, expect, it, vi } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { DeclarationId } from "../src/repository/declaration-ids.js";
import {
  buildV1CallGraph,
  type V1CallGraph,
} from "../src/repository/v1-call-graph.js";

/*
 * The installed TypeScript namespace object exposes createProgram as a
 * non-configurable property, so vi.spyOn cannot intercept it. Instead the
 * typescript module is wrapped once for this file with a counting
 * createProgram; every other export is the faithful original.
 */
vi.mock("typescript", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const countedCreateProgram = (...args: Array<unknown>): unknown => {
    const counterKey = "__v1CallGraphCreateProgramCalls";
    const holder = globalThis as Record<string, unknown>;
    holder[counterKey] = ((holder[counterKey] as number | undefined) ?? 0) + 1;
    return (actual["createProgram"] as (...inner: Array<unknown>) => unknown)(
      ...args,
    );
  };
  const mocked: Record<string, unknown> = {
    ...actual,
    createProgram: countedCreateProgram,
  };
  const defaultExport = actual["default"];

  if (defaultExport && typeof defaultExport === "object") {
    mocked["default"] = {
      ...(defaultExport as Record<string, unknown>),
      createProgram: countedCreateProgram,
    };
  }

  return mocked;
});

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
  overloadIndex?: number,
  qualifiedName?: string,
): DeclarationId {
  const found = context
    .allDeclarations()
    .find(
      (record) =>
        record.file === file &&
        record.name === name &&
        (kind === undefined || record.kind === kind) &&
        (overloadIndex === undefined ||
          record.overloadIndex === overloadIndex) &&
        (qualifiedName === undefined ||
          record.qualifiedName === qualifiedName),
    );

  if (!found) {
    throw new Error(
      `missing declaration ${kind ?? "?"} ${name} in ${file}`,
    );
  }

  return found.id;
}

describe("v1 call graph", () => {
  it(
    "builds a direct same-file caller to callee edge",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export function helper() {}
export function main() {
  helper();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/a.ts", "main", "function"),
            calleeId: idOf(context, "src/a.ts", "helper", "function"),
            callSite: { file: "src/a.ts", line: 3 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a cross-file imported function to its declaration id",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/consumer.ts": `import { helper } from "./helper";
export function consumer() {
  helper();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/consumer.ts", "consumer", "function"),
            calleeId: idOf(context, "src/helper.ts", "helper", "function"),
            callSite: { file: "src/consumer.ts", line: 3 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a renamed import to the origin declaration id",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/consumer.ts": `import { helper as h } from "./helper";
export function consumer() {
  h();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/consumer.ts", "consumer", "function"),
            calleeId: idOf(context, "src/helper.ts", "helper", "function"),
            callSite: { file: "src/consumer.ts", line: 3 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves default, namespace, and barrel imports to origin ids",
    () => {
      const { context, graph } = setup({
        "src/defs.ts": `export default function main() {}
export function named() {}
`,
        "src/barrel.ts": `export { named } from "./defs";
`,
        "src/consumer.ts": `import main from "./defs";
import * as defs from "./defs";
import { named } from "./barrel";
export function consumer() {
  main();
  defs.named();
  named();
}
`,
      });

      try {
        const caller = idOf(context, "src/consumer.ts", "consumer", "function");
        const mainId = idOf(context, "src/defs.ts", "main", "function");
        const namedId = idOf(context, "src/defs.ts", "named", "function");

        expect(graph.edges).toEqual([
          { callerId: caller, calleeId: mainId, callSite: { file: "src/consumer.ts", line: 5 } },
          { callerId: caller, calleeId: namedId, callSite: { file: "src/consumer.ts", line: 6 } },
          { callerId: caller, calleeId: namedId, callSite: { file: "src/consumer.ts", line: 7 } },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a class method call through an instance",
    () => {
      const { context, graph } = setup({
        "src/service.ts": `export class Service {
  run() {
    return 1;
  }
}
export function start() {
  const service = new Service();
  return service.run();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/service.ts", "start", "function"),
            calleeId: idOf(
              context,
              "src/service.ts",
              "run",
              "method",
              undefined,
              "Service.run",
            ),
            callSite: { file: "src/service.ts", line: 8 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a method-to-method call through this",
    () => {
      const { context, graph } = setup({
        "src/service.ts": `export class Service {
  helper() {
    return 1;
  }
  run() {
    return this.helper();
  }
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(
              context,
              "src/service.ts",
              "run",
              "method",
              undefined,
              "Service.run",
            ),
            calleeId: idOf(
              context,
              "src/service.ts",
              "helper",
              "method",
              undefined,
              "Service.helper",
            ),
            callSite: { file: "src/service.ts", line: 6 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves arrow-function and function-expression variable calls",
    () => {
      const { context, graph } = setup({
        "src/fns.ts": `export const arrow = () => 1;
export const expr = function () {
  return 2;
};
export function run() {
  arrow();
  expr();
}
`,
      });

      try {
        const caller = idOf(context, "src/fns.ts", "run", "function");

        expect(graph.edges).toEqual([
          {
            callerId: caller,
            calleeId: idOf(context, "src/fns.ts", "arrow", "variable"),
            callSite: { file: "src/fns.ts", line: 6 },
          },
          {
            callerId: caller,
            calleeId: idOf(context, "src/fns.ts", "expr", "variable"),
            callSite: { file: "src/fns.ts", line: 7 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves object method and object property function calls",
    () => {
      const { context, graph } = setup({
        "src/obj.ts": `export const handlers = {
  run() {
    return 1;
  },
  stop: () => 2,
};
export function go() {
  handlers.run();
  handlers.stop();
}
`,
      });

      try {
        const caller = idOf(context, "src/obj.ts", "go", "function");

        expect(graph.edges).toEqual([
          {
            callerId: caller,
            calleeId: idOf(
              context,
              "src/obj.ts",
              "run",
              "objectMethod",
              undefined,
              "handlers.run",
            ),
            callSite: { file: "src/obj.ts", line: 8 },
          },
          {
            callerId: caller,
            calleeId: idOf(
              context,
              "src/obj.ts",
              "stop",
              "objectMethod",
              undefined,
              "handlers.stop",
            ),
            callSite: { file: "src/obj.ts", line: 9 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a class property arrow function call",
    () => {
      const { context, graph } = setup({
        "src/service.ts": `export class Service {
  onEvent = () => 1;
  trigger() {
    return this.onEvent();
  }
}
`,
      });

      try {
        const trigger = idOf(
          context,
          "src/service.ts",
          "trigger",
          "method",
          undefined,
          "Service.trigger",
        );
        const onEvent = idOf(
          context,
          "src/service.ts",
          "onEvent",
          "property",
          undefined,
          "Service.onEvent",
        );

        expect(graph.edges).toEqual([
          {
            callerId: trigger,
            calleeId: onEvent,
            callSite: { file: "src/service.ts", line: 4 },
          },
        ]);

        expect(context.declarationOf(onEvent)?.kind).toBe("property");
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves callees through parens, non-null, as, and satisfies wrappers",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export function helper() {}
export function run(x: unknown) {
  (helper)();
  helper!();
  (helper as () => void)();
  (helper satisfies () => void)();
  void x;
}
`,
      });

      try {
        const caller = idOf(context, "src/a.ts", "run", "function");
        const callee = idOf(context, "src/a.ts", "helper", "function");

        expect(graph.edges).toEqual([
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 3 } },
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 4 } },
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 5 } },
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 6 } },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves optional-access calls",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export const service = {
  run() {
    return 1;
  },
};
export function go() {
  service?.run();
  service?.["run"]();
}
`,
      });

      try {
        const caller = idOf(context, "src/a.ts", "go", "function");
        const callee = idOf(
          context,
          "src/a.ts",
          "run",
          "objectMethod",
          undefined,
          "service.run",
        );

        expect(graph.edges).toEqual([
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 7 } },
          { callerId: caller, calleeId: callee, callSite: { file: "src/a.ts", line: 8 } },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves a static string-literal computed class property call",
    () => {
      const { context, graph } = setup({
        "src/service.ts": `export class Service {
  ["run"] = () => 1;
  trigger() {
    return this["run"]();
  }
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(
              context,
              "src/service.ts",
              "trigger",
              "method",
              undefined,
              "Service.trigger",
            ),
            calleeId: idOf(
              context,
              "src/service.ts",
              "run",
              "property",
              undefined,
              "Service.run",
            ),
            callSite: { file: "src/service.ts", line: 4 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "targets the specific overload declaration chosen by the checker",
    () => {
      const { context, graph } = setup({
        "src/ops.ts": `export function add(a: number, b: number): number;
export function add(a: string, b: string): string;
export function add(a: unknown, b: unknown): unknown {
  return a;
}
`,
        "src/main.ts": `import { add } from "./ops";
export function run() {
  return add("x", "y");
}
`,
      });

      try {
        // The string-argument call must resolve to the second overload
        // signature (line 2), not the first overload, the implementation
        // signature, or their shared SymbolId alone.
        const overloads = context
          .allDeclarations()
          .filter(
            (record) =>
              record.file === "src/ops.ts" &&
              record.name === "add" &&
              record.kind === "overload",
          );

        expect(overloads).toHaveLength(2);

        const secondOverload = overloads.find(
          (record) => record.spanStartLine === 2,
        );

        if (!secondOverload) {
          throw new Error("missing second overload signature");
        }

        expect(secondOverload.overloadIndex).not.toBe(
          overloads[0]?.overloadIndex,
        );
        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0]?.calleeId).toBe(secondOverload.id);
        expect(graph.edges[0]?.callerId).toBe(
          idOf(context, "src/main.ts", "run", "function"),
        );

        const calleeRecord = context.declarationOf(secondOverload.id);
        const implRecord = context
          .allDeclarations()
          .find(
            (record) =>
              record.file === "src/ops.ts" &&
              record.name === "add" &&
              record.kind === "function",
          );

        expect(calleeRecord?.kind).toBe("overload");
        expect(implRecord).toBeDefined();
        expect(calleeRecord?.symbolId).toBe(implRecord?.symbolId);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "omits unresolved, external, dynamic, and non-function calls",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/consumer.ts": `import { helper } from "./helper";
import "some-package";
const count = 1;
export class Widget {
  build() {
    return 1;
  }
}
export function consumer() {
  helper();
  console.log("hello");
  Math.max(1, 2);
  count();
  return new Widget();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/consumer.ts", "consumer", "function"),
            calleeId: idOf(context, "src/helper.ts", "helper", "function"),
            callSite: { file: "src/consumer.ts", line: 10 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "omits top-level callerless calls",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/main.ts": `import { helper } from "./helper";
helper();
`,
      });

      try {
        expect(graph.edges).toEqual([]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "omits accessor invocations",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export class Store {
  get value(): number {
    return 1;
  }
}
export function read(store: Store) {
  return store.value();
}
`,
      });

      try {
        expect(graph.edges).toEqual([]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "omits dynamically keyed calls while keeping statically known ones",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export const handlers = {
  run() {
    return 1;
  },
};
export function key(): string {
  return "run";
}
export function go() {
  const k = key();
  handlers.run();
  return handlers[k]();
}
`,
      });

      try {
        const go = idOf(context, "src/a.ts", "go", "function");

        // Lexical id order governs: handlers.run (offset 29) precedes
        // key (offset 61) even though discovery finds key first.
        expect(graph.edges).toEqual([
          {
            callerId: go,
            calleeId: idOf(
              context,
              "src/a.ts",
              "run",
              "objectMethod",
              undefined,
              "handlers.run",
            ),
            callSite: { file: "src/a.ts", line: 11 },
          },
          {
            callerId: go,
            calleeId: idOf(context, "src/a.ts", "key", "function"),
            callSite: { file: "src/a.ts", line: 10 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "records recursion as a self edge with matching caller and callee",
    () => {
      const { context, graph } = setup({
        "src/factorial.ts": `export function factorial(n: number) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`,
      });

      try {
        const id = idOf(context, "src/factorial.ts", "factorial", "function");

        expect(graph.edges).toEqual([
          {
            callerId: id,
            calleeId: id,
            callSite: { file: "src/factorial.ts", line: 3 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "attributes calls inside nested functions to the nearest caller",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `import { helper } from "./helper";
export function outer() {
  function inner() {
    helper();
  }
  inner();
}
`,
        "src/helper.ts": `export function helper() {}
`,
      });

      try {
        // Caller ids sort lexically: "…outer…" (offset 35) precedes
        // "…inner…" (offset 62) even though discovery finds inner first.
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/a.ts", "outer", "function"),
            calleeId: idOf(context, "src/a.ts", "inner", "function"),
            callSite: { file: "src/a.ts", line: 6 },
          },
          {
            callerId: idOf(context, "src/a.ts", "inner", "function"),
            calleeId: idOf(context, "src/helper.ts", "helper", "function"),
            callSite: { file: "src/a.ts", line: 4 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "attributes calls inside bare callbacks to the nearest eligible caller",
    () => {
      const { context, graph } = setup({
        "src/a.ts": `export function helper() {}
export function run() {
  [1].map(function (x) {
    return helper(x);
  });
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/a.ts", "run", "function"),
            calleeId: idOf(context, "src/a.ts", "helper", "function"),
            callSite: { file: "src/a.ts", line: 4 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "keeps multiple call sites to the same callee as distinct edges",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/consumer.ts": `import { helper } from "./helper";
export function consumer() {
  helper();
  helper();
}
`,
      });

      try {
        const caller = idOf(context, "src/consumer.ts", "consumer", "function");
        const callee = idOf(context, "src/helper.ts", "helper", "function");

        expect(graph.edges).toEqual([
          { callerId: caller, calleeId: callee, callSite: { file: "src/consumer.ts", line: 3 } },
          { callerId: caller, calleeId: callee, callSite: { file: "src/consumer.ts", line: 4 } },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "emits deterministic sorted output independent of traversal",
    () => {
      const { context, graph } = setup({
        "src/z.ts": `import { b } from "./b";
import { a } from "./a";
export function z() {
  b();
  a();
}
`,
        "src/b.ts": `export function b() {}
`,
        "src/a.ts": `export function a() {}
`,
      });

      try {
        const caller = idOf(context, "src/z.ts", "z", "function");

        expect(graph.edges).toEqual([
          {
            callerId: caller,
            calleeId: idOf(context, "src/a.ts", "a", "function"),
            callSite: { file: "src/z.ts", line: 5 },
          },
          {
            callerId: caller,
            calleeId: idOf(context, "src/b.ts", "b", "function"),
            callSite: { file: "src/z.ts", line: 4 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "produces identical output for reordered source insertion",
    () => {
      const first = setup({
        "src/z.ts": `import { b } from "./b";
export function z() {
  b();
}
`,
        "src/b.ts": `export function b() {}
`,
        "src/a.ts": `export function a() {}
`,
      });

      const second = setup({
        "src/a.ts": `export function a() {}
`,
        "src/b.ts": `export function b() {}
`,
        "src/z.ts": `import { b } from "./b";
export function z() {
  b();
}
`,
      });

      try {
        expect(JSON.stringify(second.graph)).toBe(
          JSON.stringify(first.graph),
        );
        expect(second.graph.edges).toHaveLength(1);
      } finally {
        finish(first.context);
        finish(second.context);
      }
    },
    30000,
  );

  it(
    "exposes stable ids verifiable through declarationOf",
    () => {
      const { context, graph } = setup({
        "src/helper.ts": `export function helper() {}
`,
        "src/consumer.ts": `import { helper } from "./helper";
export function consumer() {
  helper();
}
`,
      });

      try {
        expect(graph.edges).toHaveLength(1);

        const edge = graph.edges[0];

        if (!edge) {
          throw new Error("expected one edge");
        }

        const callerRecord = context.declarationOf(edge.callerId);
        const calleeRecord = context.declarationOf(edge.calleeId);

        expect(callerRecord).toMatchObject({
          name: "consumer",
          file: "src/consumer.ts",
          kind: "function",
        });
        expect(calleeRecord).toMatchObject({
          name: "helper",
          file: "src/helper.ts",
          kind: "function",
        });
        expect(context.symbolOf(callerRecord?.symbolId ?? "")).toBeDefined();
        expect(context.symbolOf(calleeRecord?.symbolId ?? "")).toBeDefined();
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "resolves an interface-typed receiver to the concrete method",
    () => {
      const { context, graph } = setup({
        "src/shapes.ts": `export interface Greeter {
  greet(): string;
}
export class FriendlyGreeter implements Greeter {
  greet() {
    return "hi";
  }
}
export function make() {
  const greeter = new FriendlyGreeter();
  return greeter.greet();
}
`,
      });

      try {
        expect(graph.edges).toEqual([
          {
            callerId: idOf(context, "src/shapes.ts", "make", "function"),
            calleeId: idOf(
              context,
              "src/shapes.ts",
              "greet",
              "method",
              undefined,
              "FriendlyGreeter.greet",
            ),
            callSite: { file: "src/shapes.ts", line: 11 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "expands typed-parameter receivers to every compatible implementation",
    () => {
      const { context, graph } = setup({
        "src/service.ts": `export class UserService {
  getUser() {
    return "u";
  }
}
export class AdminService extends UserService {
  getUser() {
    return "a";
  }
}
`,
        "src/consumer.ts": `import { UserService } from "./service";
export function consumer(service: UserService) {
  return service.getUser();
}
`,
      });

      try {
        const caller = idOf(
          context,
          "src/consumer.ts",
          "consumer",
          "function",
        );

        // Lexical callee-id order: AdminService.getUser (offset 114)
        // precedes UserService.getUser (offset 29) as plain strings.
        expect(graph.edges).toEqual([
          {
            callerId: caller,
            calleeId: idOf(
              context,
              "src/service.ts",
              "getUser",
              "method",
              undefined,
              "AdminService.getUser",
            ),
            callSite: { file: "src/consumer.ts", line: 3 },
          },
          {
            callerId: caller,
            calleeId: idOf(
              context,
              "src/service.ts",
              "getUser",
              "method",
              undefined,
              "UserService.getUser",
            ),
            callSite: { file: "src/consumer.ts", line: 3 },
          },
        ]);
      } finally {
        finish(context);
      }
    },
    30000,
  );

  it(
    "analyzes a live context and fails after disposal",
    () => {
      const context = new AnalysisContextImpl({
        repositoryRoot: "/repo",
        sources: {
          "src/a.ts": `export function helper() {}
export function main() {
  helper();
}
`,
        },
      });

      const graph = buildV1CallGraph(context);

      expect(graph.edges).toHaveLength(1);

      context.dispose();

      expect(() => buildV1CallGraph(context)).toThrow();
    },
    30000,
  );

  it(
    "creates zero additional programs during analysis",
    () => {
      const counterKey = "__v1CallGraphCreateProgramCalls";
      const holder = globalThis as Record<string, unknown>;
      holder[counterKey] = 0;

      const context = new AnalysisContextImpl({
        repositoryRoot: "/repo",
        sources: {
          "src/a.ts": `export function helper() {}
export function main() {
  helper();
}
`,
        },
      });

      try {
        const callsAfterConstruction = holder[counterKey] as number;

        expect(callsAfterConstruction).toBeGreaterThan(0);

        const graph = buildV1CallGraph(context);

        expect(graph.edges).toHaveLength(1);
        expect(holder[counterKey] as number).toBe(callsAfterConstruction);
      } finally {
        context.dispose();
        holder[counterKey] = 0;
      }
    },
    30000,
  );
});
