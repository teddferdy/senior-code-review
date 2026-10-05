import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  DeclarationId,
  DeclarationRecord,
} from "../src/repository/declaration-ids.js";
import type { RevTestonlycallprop001Result } from "../src/repository/rev-testonlycallprop-001.js";
import { evaluateRevTestonlycallprop001 } from "../src/repository/rev-testonlycallprop-001.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevTestonlycallprop001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return {
      context,
      result: evaluateRevTestonlycallprop001(context, options),
    };
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

const LONELY_VARIABLE = {
  "src/lonely.ts": "export const lonely = (): void => {};\n",
};

describe("REV-TESTONLYCALLPROP-001 test-only observed property/variable callables", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(LONELY_VARIABLE);

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
        const { context, result } = evaluate(LONELY_VARIABLE, {
          applicable: false,
        });

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
          const { context, result } = evaluate(LONELY_VARIABLE, {
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

    it(
      "04 evaluates when applicability is exactly true",
      () => {
        const { context, result } = evaluate(LONELY_VARIABLE, {
          applicable: true,
        });

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

  describe("ownership boundary", () => {
    it(
      "05 zero inbound variable produces no finding",
      () => {
        const { context, result } = evaluate(LONELY_VARIABLE, {
          applicable: true,
        });

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
      "06 production-only caller produces no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "src/use.ts":
              'import { handler } from "./store";\nexport function use(): void { handler(); }\n',
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
      "07 mixed production and test callers produce no finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "src/use.ts":
              'import { handler } from "./store";\nexport function use(): void { handler(); }\n',
            "tests/store.test.ts":
              'import { handler } from "../src/store";\nexport function check(): void { handler(); }\n',
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
      "08 single test caller produces one finding with one testCaller",
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
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/store.ts", "handler", "variable"),
              file: "src/store.ts",
              line: 1,
              name: "handler",
              kind: "variable",
              testCallers: [idOf(context, "tests/store.test.ts", "check")],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 multiple test callers produce one finding with distinct sorted caller IDs",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "tests/a.test.ts":
              'import { handler } from "../src/store";\nexport function checkA(): void { handler(); }\n',
            "tests/b.test.ts":
              'import { handler } from "../src/store";\nexport function checkB(): void { handler(); }\n',
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
            declarationId: idOf(context, "src/store.ts", "handler", "variable"),
            file: "src/store.ts",
            line: 1,
            name: "handler",
            kind: "variable",
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
      "10 duplicate call sites from one caller collapse into one caller ID",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "tests/store.test.ts":
              'import { handler } from "../src/store";\nexport function check(): void { handler(); handler(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.testCallers).toEqual([
            idOf(context, "tests/store.test.ts", "check"),
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 caller ordering follows UTF-16 order rather than insertion order",
      () => {
        const { context, result } = evaluate(
          {
            "src/store.ts": "export const handler = (): void => {};\n",
            "tests/b.test.ts":
              'import { handler } from "../src/store";\nexport function checkB(): void { handler(); }\n',
            "tests/a.test.ts":
              'import { handler } from "../src/store";\nexport function checkA(): void { handler(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.testCallers).toEqual([
            idOf(context, "tests/a.test.ts", "checkA"),
            idOf(context, "tests/b.test.ts", "checkB"),
          ]);
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
            "src/a.ts": "export const s = (): void => { s(); };\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
          const selfId = idOf(context, "src/a.ts", "s", "variable");
          const graph = buildV1CallGraph(context);
          expect(
            graph.edges.some(
              (edge) =>
                edge.callerId === selfId && edge.calleeId === selfId,
            ),
          ).toBe(true);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 reportee under tests/** is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helper.ts": "export const helper = (): void => {};\n",
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
  });

  describe("reportee kinds and overload adjacency", () => {
    it(
      "14 property reportee produces a finding with kind property",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class Svc {\n  handler = (): void => {};\n}\n",
            "tests/svc.test.ts":
              'import { Svc } from "../src/svc";\nexport function check(): void {\n  const svc = new Svc();\n  svc.handler();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([
            {
              declarationId: idOf(context, "src/svc.ts", "handler", "property"),
              file: "src/svc.ts",
              line: 2,
              name: "handler",
              kind: "property",
              testCallers: [idOf(context, "tests/svc.test.ts", "check")],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 arrow and function-expression variables are both reported",
      () => {
        const { context, result } = evaluate(
          {
            "src/handlers.ts":
              "export const onArrow = (): void => {};\nexport const onFn = function (): void {};\n",
            "tests/handlers.test.ts":
              'import { onArrow, onFn } from "../src/handlers";\nexport function check(): void { onArrow(); onFn(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          expect(result.violations.map((v) => v.kind)).toEqual([
            "variable",
            "variable",
          ]);
          expect(result.violations.map((v) => v.name).sort()).toEqual([
            "onArrow",
            "onFn",
          ]);
          for (const violation of result.violations) {
            expect(violation.testCallers).toEqual([
              idOf(context, "tests/handlers.test.ts", "check"),
            ]);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 test-only-called function and overload declarations are not reported here",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\n",
            "src/plain.ts": "export function plain(): void {}\n",
            "tests/f.test.ts":
              'import { f } from "../src/a";\nimport { plain } from "../src/plain";\nexport function check(): void { f("hi"); plain(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
          const observedId = overloadIdOf(context, "src/a.ts", "f", 0);
          expect(context.declarationOf(observedId)?.overloadIndex).toBe(0);
          const graph = buildV1CallGraph(context);
          expect(
            graph.edges.some((edge) => edge.calleeId === observedId),
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
      "src/one.ts": "export const one = (): void => {};\n",
      "src/two.ts": "export const two = (): void => {};\n",
      "tests/one.test.ts":
        'import { one } from "../src/one";\nexport function checkOne(): void { one(); }\n',
      "tests/two.test.ts":
        'import { two } from "../src/two";\nexport function checkTwo(): void { two(); }\n',
    };

    it(
      "17 shuffled source insertion order produces identical results",
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
      "18 repeated evaluation returns equal values with fresh allocations",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: PAIR,
        });

        try {
          const first = evaluateRevTestonlycallprop001(context, {
            applicable: true,
          });
          const second = evaluateRevTestonlycallprop001(context, {
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
