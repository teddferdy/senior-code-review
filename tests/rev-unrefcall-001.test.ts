import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  DeclarationId,
  DeclarationRecord,
} from "../src/repository/declaration-ids.js";
import type { RevUnrefcall001Result } from "../src/repository/rev-unrefcall-001.js";
import { evaluateRevUnrefcall001 } from "../src/repository/rev-unrefcall-001.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevUnrefcall001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevUnrefcall001(context, options) };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

function recordOf(
  context: AnalysisContext,
  file: string,
  name: string,
  kind?: string,
): DeclarationRecord {
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

  return found;
}

function idOf(
  context: AnalysisContext,
  file: string,
  name: string,
  kind?: string,
): DeclarationId {
  return recordOf(context, file, name, kind).id;
}

const LONELY = {
  "src/lonely.ts": "export function lonely(): void {}\n",
};

describe("REV-UNREFCALL-001 zero observed inbound V1 call edges", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(LONELY);

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "02 produces no evaluation when applicability is explicitly false",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: false });

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "03 evaluates with a finding for an uncalled function",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/lonely.ts", "lonely"),
              file: "src/lonely.ts",
              line: 1,
              name: "lonely",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "04 produces no evaluation for truthy non-boolean applicability",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(LONELY, {
            applicable: value as unknown as boolean,
          });

          try {
            expect(result).toEqual({ evaluated: false, violations: [] });
          } finally {
            finish(context);
          }
        }
      },
      30000,
    );
  });

  describe("universe", () => {
    it(
      "05 reports an uncalled function",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function solo(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "solo"),
              file: "src/a.ts",
              line: 1,
              name: "solo",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports an uncalled method but not its class",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export class S {\n  run(): void {}\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "run", "method"),
              file: "src/a.ts",
              line: 2,
              name: "run",
              kind: "method",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports each uncalled overload declaration",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): void;\nexport function f(x: number): void;\nexport function f(x: unknown): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(3);
          expect(result.violations.map((v) => v.name)).toEqual([
            "f",
            "f",
            "f",
          ]);
          expect(result.violations.map((v) => v.kind)).toEqual([
            "overload",
            "overload",
            "function",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports an uncalled object method but not its variable",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const service = {\n  run(): void {},\n};\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(
                context,
                "src/a.ts",
                "run",
                "objectMethod",
              ),
              file: "src/a.ts",
              line: 2,
              name: "run",
              kind: "objectMethod",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 an uncalled class is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export class Only {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 an uncalled interface is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export interface Shape {\n  area(): number;\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 an uncalled property is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export class C {\n  count = 0;\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 an uncalled variable is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export const x = 1;\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 a called function-valued variable is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const fn = (): void => {};\nexport function caller(): void { fn(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "caller"),
              file: "src/a.ts",
              line: 2,
              name: "caller",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 a called function-valued property is not a reportee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export class C {\n  fn = (): void => {};\n  use(): void { this.fn(); }\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "use", "method"),
              file: "src/a.ts",
              line: 3,
              name: "use",
              kind: "method",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("test scope", () => {
    it(
      "15 a tests reportee is excluded even with zero inbound",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts": "export function helper(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 a test caller protects a src callable",
      () => {
        const { context, result } = evaluate(
          {
            "src/calc.ts":
              "export function add(a: number, b: number): number { return a + b; }\n",
            "tests/calc.test.ts":
              'import { add } from "../src/calc";\nexport function check(): void { add(1, 2); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 a production caller protects a src callable",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts": "export function b(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "a"),
              file: "src/a.ts",
              line: 2,
              name: "a",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("inbound", () => {
    it(
      "18 zero inbound produces a finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function solo(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.name).toBe("solo");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 one inbound edge protects the callee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function helper(): void {}\nexport function main(): void { helper(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "main"),
              file: "src/a.ts",
              line: 2,
              name: "main",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 multiple inbound edges still protect the callee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function helper(): void {}\nexport function main1(): void { helper(); }\nexport function main2(): void { helper(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "main1",
            "main2",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 a self-call protects the callable",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function rec(n: number): number {\n  if (n <= 1) { return 1; }\n  return rec(n - 1);\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 a cross-file method call protects the method",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts": "export class Svc {\n  run(): void {}\n}\n",
            "src/main.ts":
              'import { Svc } from "./svc";\nexport function main(): void {\n  const s = new Svc();\n  s.run();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/main.ts", "main"),
              file: "src/main.ts",
              line: 2,
              name: "main",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "23 a same-file call protects the callee",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export class S {\n  run(): void {}\n}\nexport function go(s: S): void { s.run(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "go"),
              file: "src/a.ts",
              line: 4,
              name: "go",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("overloads", () => {
    const OVERLOADED = {
      "src/a.ts":
        "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\n",
    };

    function calledCalleeIds(
      context: AnalysisContext,
      sources: Record<string, string>,
    ): Set<DeclarationId> {
      void sources;
      const graph = buildV1CallGraph(context);
      return new Set(graph.edges.map((edge) => edge.calleeId));
    }

    it(
      "24 calling one overload protects only that overload",
      () => {
        const sources = {
          ...OVERLOADED,
          "src/use.ts":
            'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
        };
        const { context, result } = evaluate(sources, { applicable: true });

        try {
          const called = calledCalleeIds(context, sources);
          expect(called.size).toBe(1);
          const calledId = [...called][0] as DeclarationId;
          expect(context.declarationOf(calledId)?.overloadIndex).toBe(0);

          const reportable = context
            .allDeclarations()
            .filter(
              (record) =>
                (record.kind === "function" ||
                  record.kind === "method" ||
                  record.kind === "overload" ||
                  record.kind === "objectMethod") &&
                record.file.split("/")[0] !== "tests" &&
                !called.has(record.id),
            )
            .map((record) => ({
              declarationId: record.id,
              file: record.file,
              line: record.line,
              name: record.name,
              kind: record.kind,
            }))
            .sort((a, b) => (a.declarationId < b.declarationId ? -1 : 1));

          expect(reportable).toHaveLength(3);
          expect(result.violations).toEqual(reportable);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 a sibling overload remains independently observable",
      () => {
        const sources = {
          ...OVERLOADED,
          "src/use.ts":
            'import { f } from "./a";\nexport function use(): number { return f(42); }\n',
        };
        const { context, result } = evaluate(sources, { applicable: true });

        try {
          const called = calledCalleeIds(context, sources);
          expect(called.size).toBe(1);
          const calledId = [...called][0] as DeclarationId;
          expect(context.declarationOf(calledId)?.overloadIndex).toBe(1);

          const reportedKinds = result.violations.map((v) => v.kind);
          expect(result.violations).toHaveLength(3);
          expect(reportedKinds).toEqual(["overload", "function", "function"]);
          expect(
            result.violations.every((v) => v.declarationId !== calledId),
          ).toBe(true);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 no family-wide protection from a single overload call",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function g(x: string): void;\nexport function g(x: unknown): void {}\nexport function caller(): void { g(\"hi\"); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "g", "function"),
              file: "src/a.ts",
              line: 2,
              name: "g",
              kind: "function",
            },
            {
              declarationId: idOf(context, "src/a.ts", "caller"),
              file: "src/a.ts",
              line: 3,
              name: "caller",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("blind spots", () => {
    it(
      "27 a top-level call does not protect the callee",
      () => {
        const { context, result } = evaluate(
          {
            "src/helper.ts": "export function helper(): void {}\n",
            "src/main.ts":
              'import { helper } from "./helper";\nhelper();\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/helper.ts", "helper"),
              file: "src/helper.ts",
              line: 1,
              name: "helper",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 a constructor invocation creates no inbound edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts": "export class Svc {\n  start(): void {}\n}\n",
            "src/main.ts":
              'import { Svc } from "./svc";\nexport function boot(): void {\n  const s = new Svc();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "boot",
            "start",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 passing a function as a value creates no inbound edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function run(cb: () => void): void { cb(); }\nexport function task(): void {}\nexport function main(): void { run(task); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "task",
            "main",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 a non-literal dynamic member call creates no inbound edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts": "export class Svc {\n  run(): void {}\n}\n",
            "src/main.ts":
              'import { Svc } from "./svc";\nexport function main(key: string): void {\n  const s = new Svc();\n  (s as unknown as Record<string, () => void>)[key]();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "main",
            "run",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 call/apply/bind invocations create no inbound edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function targetCall(): void {}\nexport function targetApply(): void {}\nexport function targetBind(): void {}\nexport function main(): void {\n  targetCall.call(undefined);\n  targetApply.apply(undefined, []);\n  targetBind.bind(undefined);\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "targetCall",
            "main",
            "targetApply",
            "targetBind",
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 an exported callable with no in-universe caller is reported",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function api(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/a.ts", "api"),
              file: "src/a.ts",
              line: 1,
              name: "api",
              kind: "function",
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "33 findings follow DeclarationId ordering",
      () => {
        const { context, result } = evaluate(
          {
            "src/z.ts": "export function zed(): void {}\n",
            "src/a.ts": "export function alpha(): void {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations.map((v) => v.name)).toEqual([
            "alpha",
            "zed",
          ]);
          const ids = result.violations.map((v) => v.declarationId);
          const sorted = [...ids].sort();
          expect(ids).toEqual(sorted);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 shuffled source insertion order produces identical results",
      () => {
        const forward = {
          "src/a.ts": "export function alpha(): void {}\n",
          "src/b.ts": "export function beta(): void {}\n",
        };
        const reversed = {
          "src/b.ts": "export function beta(): void {}\n",
          "src/a.ts": "export function alpha(): void {}\n",
        };
        const first = evaluate(forward, { applicable: true });
        const second = evaluate(reversed, { applicable: true });

        try {
          expect(second.result).toEqual(first.result);
          expect(first.result.violations).toHaveLength(2);
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );

    it(
      "35 repeated evaluation returns equal values",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          const second = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          expect(second).toEqual(first);
          expect(first.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("safety", () => {
    it(
      "36 evaluation does not mutate context state",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          const pathsBefore = [...context.canonicalPaths];
          const edgesBefore = context.allModuleEdges();
          expect(result.violations).toHaveLength(1);
          expect([...context.canonicalPaths]).toEqual(pathsBefore);
          expect(context.allModuleEdges()).toEqual(edgesBefore);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 evaluation does not mutate declaration records",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

        try {
          const declarationsBefore = context.allDeclarations();
          expect(result.violations).toHaveLength(1);
          expect(context.allDeclarations()).toEqual(declarationsBefore);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 repeated evaluation returns independently allocated violations",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          const second = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          expect(second).not.toBe(first);
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations[0]).not.toBe(first.violations[0]);
          expect(second.violations[0]).toEqual(first.violations[0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "39 repeated evaluation returns fresh result arrays",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });

        try {
          const first = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          const second = evaluateRevUnrefcall001(context, {
            applicable: true,
          });
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations).toEqual(first.violations);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "40 evaluations across contexts share no mutable state",
      () => {
        const firstContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: LONELY,
        });
        const secondContext = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: {
            "src/other.ts": "export function other(): void {}\n",
          },
        });

        try {
          const first = evaluateRevUnrefcall001(firstContext, {
            applicable: true,
          });
          evaluateRevUnrefcall001(secondContext, { applicable: true });
          const again = evaluateRevUnrefcall001(firstContext, {
            applicable: true,
          });
          expect(again).toEqual(first);
          expect(again).not.toBe(first);
          expect(again.violations.map((v) => v.name)).toEqual(["lonely"]);
        } finally {
          finish(firstContext);
          finish(secondContext);
        }
      },
      30000,
    );
  });
});
