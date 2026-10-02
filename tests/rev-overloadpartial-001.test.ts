import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
  DeclarationRecord,
} from "../src/repository/declaration-ids.js";
import type {
  RevOverloadpartial001Result,
  RevOverloadpartial001Violation,
} from "../src/repository/rev-overloadpartial-001.js";
import { evaluateRevOverloadpartial001 } from "../src/repository/rev-overloadpartial-001.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevOverloadpartial001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return {
      context,
      result: evaluateRevOverloadpartial001(context, options),
    };
  } catch (error) {
    context.dispose();
    throw error;
  }
}

function finish(context: AnalysisContext): void {
  context.dispose();
}

function overloadsIn(
  context: AnalysisContext,
  file: string,
  name: string,
): DeclarationRecord[] {
  return context
    .allDeclarations()
    .filter(
      (record) =>
        record.file === file &&
        record.name === name &&
        record.kind === "overload",
    )
    .sort((left, right) => left.overloadIndex - right.overloadIndex);
}

function memberIds(violation: RevOverloadpartial001Violation): {
  observed: DeclarationId[];
  unobserved: DeclarationId[];
} {
  return {
    observed: violation.observedMembers.map((member) => member.declarationId),
    unobserved: violation.unobservedMembers.map(
      (member) => member.declarationId,
    ),
  };
}

const TWO_SIGNATURES = {
  "src/a.ts":
    "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\n",
};

const TWO_PARTIAL = {
  ...TWO_SIGNATURES,
  "src/use.ts":
    'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
};

const THREE_SIGNATURES = {
  "src/a.ts":
    "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: boolean): boolean;\nexport function f(x: unknown): unknown { return x; }\n",
};

const FOUR_SIGNATURES = {
  "src/a.ts":
    "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: boolean): boolean;\nexport function f(x: Date): Date;\nexport function f(x: unknown): unknown { return x; }\n",
};

describe("REV-OVERLOADPARTIAL-001 overload set partial usage", () => {
  describe("applicability", () => {
    it(
      "01 missing applicability is not evaluated",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL);

        try {
          expect(result).toEqual({ evaluated: false, violations: [] });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "02 false applicability is not evaluated",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
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
      "03 true applicability evaluates a partial family",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "04 truthy non-boolean applicability is not evaluated",
      () => {
        const values: unknown[] = [1, "true", {}, []];

        for (const value of values) {
          const { context, result } = evaluate(TWO_PARTIAL, {
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

    it(
      "05 falsy non-boolean applicability is not evaluated",
      () => {
        const values: unknown[] = [0, null, ""];

        for (const value of values) {
          const { context, result } = evaluate(TWO_PARTIAL, {
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

  describe("family identity", () => {
    it(
      "06 one standalone function family is grouped by shared SymbolId",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const members = overloadsIn(context, "src/a.ts", "f");
          expect(members).toHaveLength(2);
          expect(new Set(members.map((member) => member.symbolId)).size).toBe(
            1,
          );
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.familySymbolId).toBe(
            members[0]?.symbolId,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 multiple independent families produce separate findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": TWO_SIGNATURES["src/a.ts"],
            "src/b.ts":
              "export function g(x: string): string;\nexport function g(x: number): number;\nexport function g(x: unknown): unknown { return x; }\n",
            "src/use.ts":
              'import { f } from "./a";\nimport { g } from "./b";\nexport function use(): string { return f("hi") + g(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            result.violations.map((violation) => violation.familySymbolId),
          ).toEqual(["sym:src/a.ts:f:f", "sym:src/b.ts:g:g"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 distinct SymbolId declarations remain separate families",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": TWO_SIGNATURES["src/a.ts"],
            "src/b.ts":
              "export function g(x: string): string;\nexport function g(x: number): number;\nexport function g(x: unknown): unknown { return x; }\n",
            "src/use.ts":
              'import { f } from "./a";\nimport { g } from "./b";\nexport function use(): string { g("there"); g(1); return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.familySymbolId).toBe(
            "sym:src/a.ts:f:f",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 one signature plus implementation has no family finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): string;\nexport function f(x: unknown): unknown { return x; }\n",
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            overloadsIn(context, "src/a.ts", "f"),
          ).toHaveLength(1);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 implementation body is excluded from a two-signature family",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          const ids = memberIds(violation);
          const kinds = new Set(
            [...ids.observed, ...ids.unobserved].map(
              (id) => context.declarationOf(id)?.kind,
            ),
          );
          expect(kinds).toEqual(new Set(["overload"]));
          expect(context.declarationOf(ids.observed[0] as DeclarationId)?.kind).toBe(
            "overload",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("family size", () => {
    it(
      "11 one eligible member cannot be partial",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): string;\nexport function f(x: unknown): unknown { return x; }\n",
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
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
      "12 two eligible mixed members produce one finding",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers,
          ).toHaveLength(1);
          expect(
            result.violations[0]?.unobservedMembers,
          ).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 three mixed members produce one finding",
      () => {
        const { context, result } = evaluate(
          {
            ...THREE_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([2, 3]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("usage", () => {
    it(
      "14 all observed members produce no finding",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
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
      "15 all unobserved members produce no partial-use finding",
      () => {
        const { context, result } = evaluate(TWO_SIGNATURES, {
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
      "16 one observed plus one unobserved produces one finding",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 multiple observed plus one unobserved produces one finding",
      () => {
        const { context, result } = evaluate(
          {
            ...THREE_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0, 2]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([3]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 one observed plus multiple unobserved produces one finding",
      () => {
        const { context, result } = evaluate(
          {
            ...THREE_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([2, 3]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 multiple observed plus multiple unobserved produces one finding",
      () => {
        const { context, result } = evaluate(
          {
            ...FOUR_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0, 3]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1, 4]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("calls", () => {
    it(
      "20 a same-file call establishes observation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\nexport function use(): string { return f(\"hi\"); }\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 a cross-file call establishes observation",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 multiple call sites to one member stay one observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function first(): string { return f("hi"); }\nexport function second(): string { return f("there"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers,
          ).toHaveLength(1);
          expect(
            result.violations[0]?.unobservedMembers,
          ).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "23 calls to multiple members are retained in one finding",
      () => {
        const { context, result } = evaluate(
          {
            ...THREE_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0, 2]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 a test caller establishes observation for a src member",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "tests/use.ts":
              'import { f } from "../src/a";\nexport function use(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 a representable self-call establishes observation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return f("s"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "26 an alias-mediated call establishes observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/barrel.ts": 'export { f } from "./a";\n',
            "src/use.ts":
              'import { f } from "./barrel";\nexport function use(): string { return f("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 checker selection protects only the selected overload",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          expect(
            violation.observedMembers.map((member) => member.overloadIndex),
          ).toEqual([0]);
          expect(
            violation.unobservedMembers.map((member) => member.overloadIndex),
          ).toEqual([1]);
          expect(
            context.declarationOf(
              violation.observedMembers[0]?.declarationId as DeclarationId,
            )?.overloadIndex,
          ).toBe(0);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 calling one overload does not mark its sibling observed",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const graph = buildV1CallGraph(context);
          const members = overloadsIn(context, "src/a.ts", "f");
          const callees = new Set(graph.edges.map((edge) => edge.calleeId));

          expect(members).toHaveLength(2);
          expect(callees.has(members[0]?.id as DeclarationId)).toBe(true);
          expect(callees.has(members[1]?.id as DeclarationId)).toBe(false);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("methods", () => {
    it(
      "29 a class-method overload family is eligible",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class S {\n  run(x: string): string;\n  run(x: number): number;\n  run(x: unknown): unknown { return x; }\n}\n",
            "src/use.ts":
              'import { S } from "./svc";\nexport function use(): string { const s = new S(); return s.run("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.name).toBe("run");
          expect(result.violations[0]?.qualifiedName).toBe("S.run");
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 a class-method implementation is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class S {\n  run(x: string): string;\n  run(x: number): number;\n  run(x: unknown): unknown { return x; }\n}\n",
            "src/use.ts":
              'import { S } from "./svc";\nexport function use(): string { const s = new S(); return s.run("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          const kinds = new Set(
            [
              ...violation.observedMembers,
              ...violation.unobservedMembers,
            ].map(
              (member) =>
                context.declarationOf(member.declarationId)?.kind,
            ),
          );
          expect(kinds).toEqual(new Set(["overload"]));
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 an instance call selects the represented overload",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class S {\n  run(x: string): string;\n  run(x: number): number;\n  run(x: unknown): unknown { return x; }\n}\n",
            "src/use.ts":
              'import { S } from "./svc";\nexport function use(): number { const s = new S(); return s.run(42); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 an interface method signature creates no eligible family",
      () => {
        const { context, result } = evaluate(
          {
            "src/api.ts":
              "export interface I {\n  run(x: string): string;\n  run(x: number): number;\n}\nexport function use(value: I): string { return value.run(\"hi\"); }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allDeclarations()
              .filter((record) => record.kind === "overload"),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 a constructor creates no eligible overload family",
      () => {
        const { context, result } = evaluate(
          {
            "src/value.ts":
              "export class C {\n  constructor(x: string);\n  constructor(x: number);\n  constructor(x: unknown) {}\n}\nexport function make(): C { return new C(\"hi\"); }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allDeclarations()
              .filter((record) => record.kind === "overload"),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("scope", () => {
    it(
      "34 tests overload declarations are never eligible",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helper.ts":
              "export function f(x: string): string;\nexport function f(x: number): number;\nexport function f(x: unknown): unknown { return x; }\n",
            "src/use.ts":
              'import { f } from "../tests/helper";\nexport function use(): string { return f("hi"); }\n',
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
      "35 src overload declarations are eligible",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          expect(result.violations[0]?.file).toBe(
            "src/a.ts" as CanonicalPath,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "36 ordinary functions without overloads create no family",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function f(): string { return \"f\"; }\nexport function use(): string { return f(); }\n",
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
      "37 implementation methods without overloads create no family",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class S {\n  run(): string { return \"run\"; }\n}\nexport function use(): string { const s = new S(); return s.run(); }\n",
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
      "38 object methods create no overload family",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const service = {\n  run(): string { return \"run\"; },\n};\nexport function use(): string { return service.run(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allDeclarations()
              .filter((record) => record.kind === "overload"),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "39 function-valued properties and variables create no family",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export const run = (): string => \"run\";\nexport function use(): string { return run(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allDeclarations()
              .filter((record) => record.kind === "overload"),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "40 class and interface declarations create no family",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export class C {\n  value = 1;\n}\nexport interface I {\n  value: number;\n}\nexport function use(value: I): number { return value.value; }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allDeclarations()
              .filter((record) => record.kind === "overload"),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("interaction", () => {
    it(
      "41 an unobserved family member has zero represented inbound calls",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          const graph = buildV1CallGraph(context);
          const callees = new Set(graph.edges.map((edge) => edge.calleeId));

          for (const member of violation.observedMembers) {
            expect(callees.has(member.declarationId)).toBe(true);
          }

          for (const member of violation.unobservedMembers) {
            expect(callees.has(member.declarationId)).toBe(false);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "42 multiple call sites do not duplicate the family finding",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function first(): string { return f("hi"); }\nexport function second(): string { return f("there"); }\nexport function third(): string { return f("again"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("evidence", () => {
    it(
      "43 family evidence contains exactly the locked fields",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          expect(Object.keys(violation).sort()).toEqual([
            "familySymbolId",
            "file",
            "name",
            "observedMembers",
            "qualifiedName",
            "unobservedMembers",
          ]);
          expect(violation).toEqual({
            familySymbolId: "sym:src/a.ts:f:f",
            file: "src/a.ts",
            name: "f",
            qualifiedName: "f",
            observedMembers: violation.observedMembers,
            unobservedMembers: violation.unobservedMembers,
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "44 member evidence contains exactly declaration, line, and index",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          for (const member of [
            ...violation.observedMembers,
            ...violation.unobservedMembers,
          ]) {
            expect(Object.keys(member).sort()).toEqual([
              "declarationId",
              "line",
              "overloadIndex",
            ]);
            expect(
              context.declarationOf(member.declarationId)?.line,
            ).toBe(member.line);
            expect(
              context.declarationOf(member.declarationId)?.overloadIndex,
            ).toBe(member.overloadIndex);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "45 family context comes from the lowest overload index",
      () => {
        const { context, result } = evaluate(
          {
            ...THREE_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): number { return f(1); }\n',
          },
          { applicable: true },
        );

        try {
          const violation = result.violations[0];
          expect(violation).toBeDefined();
          if (!violation) {
            throw new Error("missing expected family finding");
          }

          expect(violation.file).toBe("src/a.ts");
          expect(violation.name).toBe("f");
          expect(violation.qualifiedName).toBe("f");
          expect(
            violation.observedMembers.map((member) => member.overloadIndex),
          ).toEqual([2]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("ordering", () => {
    it(
      "46 families sort by familySymbolId",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              "export function g(x: string): string;\nexport function g(x: number): number;\nexport function g(x: unknown): unknown { return x; }\n",
            "src/a.ts": TWO_SIGNATURES["src/a.ts"],
            "src/use.ts":
              'import { f } from "./a";\nimport { g } from "./b";\nexport function use(): string { return f("hi") + g("there"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            result.violations.map((violation) => violation.familySymbolId),
          ).toEqual(["sym:src/a.ts:f:f", "sym:src/b.ts:g:g"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "47 members sort by overloadIndex",
      () => {
        const { context, result } = evaluate(
          {
            ...FOUR_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            result.violations[0]?.observedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([0, 3]);
          expect(
            result.violations[0]?.unobservedMembers.map(
              (member) => member.overloadIndex,
            ),
          ).toEqual([1, 4]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "48 reordered source insertion gives the same finding",
      () => {
        const forward = {
          ...TWO_SIGNATURES,
          "src/use.ts":
            'import { f } from "./a";\nexport function use(): string { return f("hi"); }\n',
        };
        const reversed = {
          "src/use.ts": forward["src/use.ts"],
          "src/a.ts": forward["src/a.ts"],
        };
        const first = evaluate(forward, { applicable: true });
        const second = evaluate(reversed, { applicable: true });

        try {
          expect(second.result).toEqual(first.result);
          expect(first.result.violations).toHaveLength(1);
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );
  });

  describe("mutation and freshness", () => {
    it(
      "49 repeated evaluation is deep-equal but independently allocated",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: TWO_PARTIAL,
        });

        try {
          const first = evaluateRevOverloadpartial001(context, {
            applicable: true,
          });
          const second = evaluateRevOverloadpartial001(context, {
            applicable: true,
          });

          expect(second).toEqual(first);
          expect(second).not.toBe(first);
          expect(second.violations).not.toBe(first.violations);
          expect(second.violations[0]).not.toBe(first.violations[0]);
          expect(second.violations[0]?.observedMembers).not.toBe(
            first.violations[0]?.observedMembers,
          );
          expect(second.violations[0]?.unobservedMembers).not.toBe(
            first.violations[0]?.unobservedMembers,
          );
          expect(second.violations[0]?.observedMembers[0]).not.toBe(
            first.violations[0]?.observedMembers[0],
          );
          expect(second.violations[0]?.unobservedMembers[0]).not.toBe(
            first.violations[0]?.unobservedMembers[0],
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "50 evaluation leaves context-owned facts unchanged",
      () => {
        const { context, result } = evaluate(TWO_PARTIAL, {
          applicable: true,
        });

        try {
          const pathsBefore = [...context.canonicalPaths];
          const declarationsBefore = context.allDeclarations();
          const graphBefore = buildV1CallGraph(context);

          expect(result.violations).toHaveLength(1);
          expect([...context.canonicalPaths]).toEqual(pathsBefore);
          expect(context.allDeclarations()).toEqual(declarationsBefore);
          expect(buildV1CallGraph(context)).toEqual(graphBefore);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "51 separate contexts do not share evaluation state",
      () => {
        const first = evaluate(TWO_PARTIAL, { applicable: true });
        const second = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): string { return f("hi") + f(1); }\n',
          },
          { applicable: true },
        );

        try {
          expect(first.result.violations).toHaveLength(1);
          expect(second.result.violations).toEqual([]);
          expect(first.result.violations[0]?.familySymbolId).toBe(
            "sym:src/a.ts:f:f",
          );
        } finally {
          finish(first.context);
          finish(second.context);
        }
      },
      30000,
    );
  });

  describe("V1 limitations", () => {
    it(
      "52 an unmappable overload call creates no observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function use(): unknown { return (f as any)("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            buildV1CallGraph(context).edges.filter((edge) =>
              overloadsIn(context, "src/a.ts", "f").some(
                (member) => member.id === edge.calleeId,
              ),
            ),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "53 a dynamic member call creates no overload observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nconst target = { f };\nexport function use(key: string): unknown { return (target as any)[key]("hi"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            buildV1CallGraph(context).edges.filter((edge) =>
              overloadsIn(context, "src/a.ts", "f").some(
                (member) => member.id === edge.calleeId,
              ),
            ),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "54 passing an overload as a callback creates no call observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { f } from "./a";\nexport function invoke(callback: (value: string) => string): string { return callback("hi"); }\nexport function start(): string { return invoke(f); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            buildV1CallGraph(context).edges.filter((edge) =>
              overloadsIn(context, "src/a.ts", "f").some(
                (member) => member.id === edge.calleeId,
              ),
            ),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "55 construction alone creates no overload observation",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class S {\n  run(x: string): string;\n  run(x: number): number;\n  run(x: unknown): unknown { return x; }\n}\nexport function make(): S { return new S(); }\n",
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
      "56 an unrelated external call creates no overload observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts":
              'import { join } from "some-package";\nexport function use(): string { return join("a", "b"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(
            buildV1CallGraph(context).edges.filter((edge) =>
              overloadsIn(context, "src/a.ts", "f").some(
                (member) => member.id === edge.calleeId,
              ),
            ),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "57 a top-level callerless call creates no overload observation",
      () => {
        const { context, result } = evaluate(
          {
            ...TWO_SIGNATURES,
            "src/use.ts": 'import { f } from "./a";\nf("hi");\n',
          },
          { applicable: true },
        );

        try {
          expect(
            buildV1CallGraph(context).edges.filter((edge) =>
              overloadsIn(context, "src/a.ts", "f").some(
                (member) => member.id === edge.calleeId,
              ),
            ),
          ).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
