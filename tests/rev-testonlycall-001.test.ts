import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  DeclarationId,
  DeclarationRecord,
} from "../src/repository/declaration-ids.js";
import type { RevTestonlycall001Result } from "../src/repository/rev-testonlycall-001.js";
import { evaluateRevTestonlycall001 } from "../src/repository/rev-testonlycall-001.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevTestonlycall001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevTestonlycall001(context, options) };
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

function overloadIdOf(
  context: AnalysisContext,
  file: string,
  name: string,
  overloadIndex: number,
): DeclarationId {
  const found = context
    .allDeclarations()
    .find(
      (record) =>
        record.file === file &&
        record.name === name &&
        record.kind === "overload" &&
        record.overloadIndex === overloadIndex,
    );

  if (!found) {
    throw new Error(
      `missing overload ${name}#${overloadIndex} in ${file}`,
    );
  }

  return found.id;
}

const LONELY = {
  "src/lonely.ts": "export function lonely(): void {}\n",
};

describe("REV-TESTONLYCALL-001 test-only observed production callables", () => {
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
      "03 produces no evaluation for truthy non-boolean applicability values",
      () => {
        const values: unknown[] = [1, "true", "yes", {}, []];

        for (const value of values) {
          const { context, result } = evaluate(LONELY, {
            applicable: value as boolean,
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

  describe("ownership boundary", () => {
    it(
      "04 zero inbound eligible callable produces no finding",
      () => {
        const { context, result } = evaluate(LONELY, { applicable: true });

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
      "05 production-only caller produces no finding",
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
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 mixed production and test callers produce no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/calc.ts":
              "export function add(a: number, b: number): number { return a + b; }\n",
            "src/use.ts":
              'import { add } from "./calc";\nexport function use(): number { return add(1, 2); }\n',
            "tests/calc.test.ts":
              'import { add } from "../src/calc";\nexport function check(): void { add(3, 4); }\n',
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
  });

  describe("test-only observation", () => {
    it(
      "07 single test caller produces one finding with one testCaller",
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
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/calc.ts", "add"),
              file: "src/calc.ts",
              line: 1,
              name: "add",
              kind: "function",
              testCallers: [idOf(context, "tests/calc.test.ts", "check")],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 multiple test callers produce one finding with distinct sorted caller IDs",
      () => {
        const { context, result } = evaluate(
          {
            "src/calc.ts":
              "export function add(a: number, b: number): number { return a + b; }\n",
            "tests/a.test.ts":
              'import { add } from "../src/calc";\nexport function checkA(): number { return add(1, 2) + add(3, 4); }\n',
            "tests/b.test.ts":
              'import { add } from "../src/calc";\nexport function checkB(): number { return add(5, 6); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const callerA = idOf(context, "tests/a.test.ts", "checkA");
          const callerB = idOf(context, "tests/b.test.ts", "checkB");
          const sorted = [callerA, callerB].sort((left, right) =>
            left < right ? -1 : 1,
          );

          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]).toEqual({
            declarationId: idOf(context, "src/calc.ts", "add"),
            file: "src/calc.ts",
            line: 1,
            name: "add",
            kind: "function",
            testCallers: sorted,
          });
          expect(sorted).toEqual([callerA, callerB]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 same-file production caller produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function used(): void {}\nexport function user(): void { used(); }\n",
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
      "10 cross-file test caller reports a method callee",
      () => {
        const { context, result } = evaluate(
          {
            "src/service.ts":
              "export class Service {\n  run(): void {}\n}\n",
            "tests/service.test.ts":
              'import { Service } from "../src/service";\nexport function check(): void {\n  const service = new Service();\n  service.run();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/service.ts", "run", "method"),
              file: "src/service.ts",
              line: 2,
              name: "run",
              kind: "method",
              testCallers: [idOf(context, "tests/service.test.ts", "check")],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 reportee under tests/** is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helper.ts": "export function helper(): void {}\n",
            "tests/use.test.ts":
              'import { helper } from "./helper";\nexport function check(): void { helper(); }\n',
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
      "12 production self-call produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function s(): void { s(); }\n",
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
      "13 tests-filed self-call cannot produce an eligible reportee",
      () => {
        const { context, result } = evaluate(
          {
            "tests/s.test.ts": "export function t(): void { t(); }\n",
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
  });

  describe("overloads and excluded kinds", () => {
    it(
      "14 overload members are observed independently",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\n",
            "tests/f.test.ts":
              'import { f } from "../src/a";\nexport function check(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const observedId = overloadIdOf(context, "src/a.ts", "f", 0);
          expect(context.declarationOf(observedId)?.overloadIndex).toBe(0);
          expect(result.violations).toEqual([
            {
              declarationId: observedId,
              file: "src/a.ts",
              line: 1,
              name: "f",
              kind: "overload",
              testCallers: [idOf(context, "tests/f.test.ts", "check")],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 test-only-observed property/variable is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "tests/store.test.ts":
              'import { handler } from "../src/store";\nexport function check(): void { handler(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
          const handlerId = idOf(context, "src/store.ts", "handler", "variable");
          const graph = buildV1CallGraph(context);
          expect(
            graph.edges.some((edge) => edge.calleeId === handlerId),
          ).toBe(true);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism and freshness", () => {
    const PAIR = {
      "src/one.ts": "export function one(): void {}\n",
      "src/two.ts": "export function two(): void {}\n",
      "tests/one.test.ts":
        'import { one } from "../src/one";\nexport function checkOne(): void { one(); }\n',
      "tests/two.test.ts":
        'import { two } from "../src/two";\nexport function checkTwo(): void { two(); }\n',
    };

    it(
      "16 shuffled source insertion order produces identical results",
      () => {
        const forward = evaluate(PAIR, { applicable: true });
        const reversed = evaluate(
          Object.fromEntries(Object.entries(PAIR).reverse()),
          { applicable: true },
        );

        try {
          expect(forward.result.evaluated).toBe(true);
          expect(reversed.result.evaluated).toBe(true);
          expect(forward.result.violations).toHaveLength(2);
          expect(reversed.result.violations).toEqual(
            forward.result.violations,
          );
        } finally {
          finish(forward.context);
          finish(reversed.context);
        }
      },
      30000,
    );

    it(
      "17 repeated evaluation returns equal values with fresh allocations",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevTestonlycall001(context, {
            applicable: true,
          });
          const second = evaluateRevTestonlycall001(context, {
            applicable: true,
          });

          expect(first).toEqual(second);
          expect(first.violations).toHaveLength(2);
          expect(second).not.toBe(first);
          expect(second.violations).not.toBe(first.violations);

          for (let index = 0; index < first.violations.length; index += 1) {
            const left = first.violations[index] as
              | { testCallers: readonly DeclarationId[] }
              | undefined;
            const right = second.violations[index] as
              | { testCallers: readonly DeclarationId[] }
              | undefined;

            expect(right).not.toBe(left);
            expect(right?.testCallers).not.toBe(left?.testCallers);
            expect(right?.testCallers).toEqual(left?.testCallers);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
