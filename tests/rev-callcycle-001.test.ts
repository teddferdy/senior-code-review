import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { DeclarationId } from "../src/repository/declaration-ids.js";
import type { RevCallcycle001Result } from "../src/repository/rev-callcycle-001.js";
import { evaluateRevCallcycle001 } from "../src/repository/rev-callcycle-001.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevCallcycle001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevCallcycle001(context, options) };
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

function cyclePairs(result: RevCallcycle001Result): string[][] {
  return result.violations.map((violation) =>
    violation.cycle.map((edge) => [edge.from, edge.to]),
  );
}

const LONELY = {
  "src/lonely.ts": "export function lonely(): void {}\n",
};

describe("REV-CALLCYCLE-001 observed call cycle review", () => {
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
      "03 produces no evaluation for truthy non-boolean applicability",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

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

  describe("cycle detection", () => {
    it(
      "04 reports a direct self-call as a length-1 cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts": "export function f(): void { f(); }\n",
          },
          { applicable: true },
        );

        try {
          const f = idOf(context, "src/f.ts", "f", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([[[f, f]]]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "05 multiple self-call sites produce one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              "export function f(): void {\n  f();\n  f();\n}\n",
          },
          { applicable: true },
        );

        try {
          const f = idOf(context, "src/f.ts", "f", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([[[f, f]]]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "06 reports mutual recursion as one closed cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts":
              'import { a } from "./a";\nexport function b(): void { a(); }\n',
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/a.ts", "a", "function");
          const b = idOf(context, "src/b.ts", "b", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [a, b],
              [b, a],
            ],
          ]);
          const cycle = result.violations[0]?.cycle ?? [];
          expect(cycle[cycle.length - 1]?.to).toBe(cycle[0]?.from);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 rotated representations collapse to one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/b.ts":
              'import { a } from "./a";\nexport function b(): void { a(); }\n',
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          const cycle = result.violations[0]?.cycle ?? [];
          expect(cycle).toHaveLength(2);
          expect(cycle[cycle.length - 1]?.to).toBe(cycle[0]?.from);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports a three-declaration cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts":
              'import { c } from "./c";\nexport function b(): void { c(); }\n',
            "src/c.ts":
              'import { a } from "./a";\nexport function c(): void { a(); }\n',
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/a.ts", "a", "function");
          const b = idOf(context, "src/b.ts", "b", "function");
          const c = idOf(context, "src/c.ts", "c", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [a, b],
              [b, c],
              [c, a],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports multiple distinct cycles inside one SCC",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { c } from "./c";\nexport function a(): void { b(); c(); }\n',
            "src/b.ts":
              'import { d } from "./d";\nexport function b(): void { d(); }\n',
            "src/c.ts":
              'import { d } from "./d";\nexport function c(): void { d(); }\n',
            "src/d.ts":
              'import { a } from "./a";\nexport function d(): void { a(); }\n',
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/a.ts", "a", "function");
          const b = idOf(context, "src/b.ts", "b", "function");
          const c = idOf(context, "src/c.ts", "c", "function");
          const d = idOf(context, "src/d.ts", "d", "function");
          expect(result.violations).toHaveLength(2);
          expect(cyclePairs(result)).toEqual([
            [
              [a, b],
              [b, d],
              [d, a],
            ],
            [
              [a, c],
              [c, d],
              [d, a],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 keeps distinct cycles sharing only a vertex",
      () => {
        const { context, result } = evaluate(
          {
            "src/hub.ts":
              'import { left } from "./left";\nimport { right } from "./right";\nexport function hub(): void { left(); right(); }\n',
            "src/left.ts":
              'import { hub } from "./hub";\nexport function left(): void { hub(); }\n',
            "src/right.ts":
              'import { hub } from "./hub";\nexport function right(): void { hub(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);

          for (const violation of result.violations) {
            expect(violation.cycle).toHaveLength(2);
            expect(violation.cycle[1]?.to).toBe(violation.cycle[0]?.from);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 keeps distinct cycles sharing an edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts":
              'import { c } from "./c";\nimport { d } from "./d";\nexport function b(): void { c(); d(); }\n',
            "src/c.ts":
              'import { a } from "./a";\nexport function c(): void { a(); }\n',
            "src/d.ts":
              'import { a } from "./a";\nexport function d(): void { a(); }\n',
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/a.ts", "a", "function");
          const b = idOf(context, "src/b.ts", "b", "function");
          const c = idOf(context, "src/c.ts", "c", "function");
          const d = idOf(context, "src/d.ts", "d", "function");
          expect(result.violations).toHaveLength(2);
          expect(cyclePairs(result)).toEqual([
            [
              [a, b],
              [b, c],
              [c, a],
            ],
            [
              [a, b],
              [b, d],
              [d, a],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 reports a same-file cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/pair.ts":
              "export function ping(): void { pong(); }\nexport function pong(): void { ping(); }\n",
          },
          { applicable: true },
        );

        try {
          const ping = idOf(context, "src/pair.ts", "ping", "function");
          const pong = idOf(context, "src/pair.ts", "pong", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [ping, pong],
              [pong, ping],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "13 reports multiple same-file cycles in sorted order",
      () => {
        const { context, result } = evaluate(
          {
            "src/pairs.ts":
              "export function c(): void { d(); }\nexport function d(): void { c(); }\nexport function a(): void { b(); }\nexport function b(): void { a(); }\n",
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/pairs.ts", "a", "function");
          const b = idOf(context, "src/pairs.ts", "b", "function");
          const c = idOf(context, "src/pairs.ts", "c", "function");
          const d = idOf(context, "src/pairs.ts", "d", "function");
          expect(result.violations).toHaveLength(2);
          expect(cyclePairs(result)).toEqual([
            [
              [c, d],
              [d, c],
            ],
            [
              [b, a],
              [a, b],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 reports a cross-file cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/alpha.ts":
              'import { beta } from "./beta";\nexport function alpha(): void { beta(); }\n',
            "src/beta.ts":
              'import { alpha } from "./alpha";\nexport function beta(): void { alpha(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          const files = new Set(
            result.violations.flatMap((violation) =>
              violation.cycle.map((edge) => edge.callSite.file),
            ),
          );
          expect([...files].sort()).toEqual(["src/alpha.ts", "src/beta.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 reports a mixed same-file and cross-file cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/first.ts":
              'import { far } from "./second";\nexport function near(): void { next(); }\nexport function next(): void { far(); }\n',
            "src/second.ts":
              'import { near } from "./first";\nexport function far(): void { near(); }\n',
          },
          { applicable: true },
        );

        try {
          const near = idOf(context, "src/first.ts", "near", "function");
          const next = idOf(context, "src/first.ts", "next", "function");
          const far = idOf(context, "src/second.ts", "far", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [near, next],
              [next, far],
              [far, near],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 an overload-resolved self-call produces no fabricated cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              'export function f(x: string): void;\nexport function f(x: number): void;\nexport function f(x: unknown): void { f("s"); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toEqual([]);

          const graph = buildV1CallGraph(context);
          const overload = context
            .allDeclarations()
            .find(
              (record) =>
                record.file === "src/f.ts" &&
                record.name === "f" &&
                record.kind === "overload" &&
                record.id.endsWith("#0"),
            );

          if (!overload) {
            throw new Error("missing overload declaration");
          }

          expect(
            graph.edges.some((edge) => edge.calleeId === overload.id),
          ).toBe(true);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "17 distinct overload callee IDs coexist with cycle detection",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              'import { g } from "./g";\nexport function f(x: string): void;\nexport function f(x: number): void;\nexport function f(x: unknown): void { g(); }\n',
            "src/g.ts":
              'import { f } from "./f";\nexport function g(): void { f(1); }\n',
            "src/p.ts":
              'import { q } from "./q";\nexport function p(): void { q(); }\n',
            "src/q.ts":
              'import { p } from "./p";\nexport function q(): void { p(); }\n',
          },
          { applicable: true },
        );

        try {
          const p = idOf(context, "src/p.ts", "p", "function");
          const q = idOf(context, "src/q.ts", "q", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [p, q],
              [q, p],
            ],
          ]);

          const graph = buildV1CallGraph(context);
          const overloadTargets = new Set(
            graph.edges
              .filter((edge) => edge.calleeId.includes(":overload:"))
              .map((edge) => edge.calleeId),
          );
          expect(overloadTargets.size).toBeGreaterThanOrEqual(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 same pair at different call sites stays one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              'import { g } from "./g";\nexport function f(): void {\n  g();\n  g();\n}\n',
            "src/g.ts":
              'import { f } from "./f";\nexport function g(): void { f(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.cycle).toHaveLength(2);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 the retained call site is the deterministic minimum",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              'import { g } from "./g";\nexport function f(): void {\n  g();\n  g();\n}\n',
            "src/g.ts":
              'import { f } from "./f";\nexport function g(): void { f(); }\n',
          },
          { applicable: true },
        );

        try {
          const cycle = result.violations[0]?.cycle ?? [];
          expect(cycle).toHaveLength(2);
          expect(cycle[0]?.callSite).toEqual({ file: "src/f.ts", line: 3 });
          expect(cycle[1]?.callSite).toEqual({ file: "src/g.ts", line: 2 });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 three call sites still produce one finding",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              'import { g } from "./g";\nexport function f(): void {\n  g();\n  g();\n  g();\n}\n',
            "src/g.ts":
              'import { f } from "./f";\nexport function g(): void { f(); }\n',
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 self-call needs no module self-import",
      () => {
        const { context, result } = evaluate(
          {
            "src/solo.ts": "export function solo(): void { solo(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(
            context
              .allModuleEdges()
              .filter((edge) => edge.to === edge.from),
          ).toEqual([]);
          expect(result.violations).toHaveLength(1);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 a self-call finding is a single closed edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/solo.ts": "export function solo(): void { solo(); }\n",
          },
          { applicable: true },
        );

        try {
          const solo = idOf(context, "src/solo.ts", "solo", "function");
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.cycle).toEqual([
            {
              from: solo,
              to: solo,
              callSite: { file: "src/solo.ts", line: 1 },
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "23 a test-only self-recursive helper is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helper.test.ts":
              "export function helper(): void { helper(); }\n",
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
      "24 src to tests to src does not bridge a cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { h } from "../tests/helper";\nexport function a(): void { h(); }\n',
            "tests/helper.ts":
              'import { b } from "../src/b";\nexport function h(): void { b(); }\n',
            "src/b.ts":
              'import { a } from "./a";\nexport function b(): void { a(); }\n',
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
      "25 a tests to src edge cannot create a source cycle",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts":
              'import { a } from "../src/a";\nexport function t(): void { a(); }\n',
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts":
              'import { t } from "../tests/t";\nexport function b(): void { t(); }\n',
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
      "26 a cycle entirely inside tests is excluded",
      () => {
        const { context, result } = evaluate(
          {
            "tests/t.ts":
              'import { u } from "./u";\nexport function t(): void { u(); }\n',
            "tests/u.ts":
              'import { t } from "./t";\nexport function u(): void { t(); }\n',
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
      "27 a simple call chain is not a cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts":
              'import { c } from "./c";\nexport function b(): void { c(); }\n',
            "src/c.ts": "export function c(): void {}\n",
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
      "28 disconnected chains are not cycles",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nexport function a(): void { b(); }\n',
            "src/b.ts": "export function b(): void {}\n",
            "src/c.ts":
              'import { d } from "./d";\nexport function c(): void { d(); }\n',
            "src/d.ts": "export function d(): void {}\n",
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
      "29 shared connectivity without a back edge is not a cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { b } from "./b";\nimport { c } from "./c";\nexport function a(): void { b(); c(); }\n',
            "src/b.ts":
              'import { d } from "./d";\nexport function b(): void { d(); }\n',
            "src/c.ts":
              'import { d } from "./d";\nexport function c(): void { d(); }\n',
            "src/d.ts": "export function d(): void {}\n",
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
      "30 a universe without calls evaluates with no findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export const a = 1;\n",
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
      "31 an omitted call target cannot form a cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              'import { ghost } from "./missing";\nexport function a(): void { ghost(); }\n',
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
      "32 a callback reference produces no invented cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/run.ts":
              'import { h } from "./h";\nexport function run(): void { [1].map(h); }\n',
            "src/h.ts":
              'import { run } from "./run";\nexport function h(): void { run(); }\n',
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
      "33 a .call indirection produces no invented cycle",
      () => {
        const { context, result } = evaluate(
          {
            "src/f.ts":
              "export function f(): void { f.call(null); }\n",
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
      "34 reversed source insertion still yields identical findings",
      () => {
        const forward = {
          "src/a.ts":
            'import { b } from "./b";\nexport function a(): void { b(); }\n',
          "src/b.ts":
            'import { c } from "./c";\nexport function b(): void { c(); }\n',
          "src/c.ts":
            'import { a } from "./a";\nexport function c(): void { a(); }\n',
        };
        const reversed = {
          "src/c.ts":
            'import { a } from "./a";\nexport function c(): void { a(); }\n',
          "src/b.ts":
            'import { c } from "./c";\nexport function b(): void { c(); }\n',
          "src/a.ts":
            'import { b } from "./b";\nexport function a(): void { b(); }\n',
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

    it(
      "35 declaration definition order does not change findings",
      () => {
        // DeclarationIds embed source offsets, so reordered definitions
        // necessarily carry different IDs. Determinism therefore means:
        // same member names, same closed structure, and each run starts
        // at its own lexicographic minimum.
        const toNames = (
          context: AnalysisContext,
          pairs: string[][],
        ): string[][] =>
          pairs.map((cycle) =>
            cycle.map(([from, to]) => {
              const fromRecord = context.declarationOf(from as DeclarationId);
              const toRecord = context.declarationOf(to as DeclarationId);

              if (!fromRecord || !toRecord) {
                throw new Error("unresolvable cycle endpoint");
              }

              return [fromRecord.name, toRecord.name];
            }),
          );

        const normalizeRotation = (cycles: string[][]): string[][] =>
          cycles.map((cycle) => {
            const firsts = cycle.map((pair) => pair[0] as string);
            const minimum = [...firsts].sort()[0] as string;
            const start = firsts.indexOf(minimum);
            return [...cycle.slice(start), ...cycle.slice(0, start)];
          });

        const ordered = evaluate(
          {
            "src/pair.ts":
              "export function a(): void { b(); }\nexport function b(): void { a(); }\n",
          },
          { applicable: true },
        );
        const shuffled = evaluate(
          {
            "src/pair.ts":
              "export function b(): void { a(); }\nexport function a(): void { b(); }\n",
          },
          { applicable: true },
        );

        try {
          expect(ordered.result.violations).toHaveLength(1);
          expect(shuffled.result.violations).toHaveLength(1);
          expect(
            normalizeRotation(
              toNames(ordered.context, cyclePairs(ordered.result)),
            ),
          ).toEqual(
            normalizeRotation(
              toNames(shuffled.context, cyclePairs(shuffled.result)),
            ),
          );

          for (const result of [ordered.result, shuffled.result]) {
            const cycle = result.violations[0]?.cycle ?? [];
            const ids = cycle.map((edge) => edge.from);
            const minimum = [...ids].sort()[0] as string;
            expect(cycle[0]?.from).toBe(minimum);
            expect(cycle[cycle.length - 1]?.to).toBe(cycle[0]?.from);
          }
        } finally {
          finish(ordered.context);
          finish(shuffled.context);
        }
      },
      30000,
    );

    it(
      "36 canonical rotation starts at the smallest declaration",
      () => {
        const { context, result } = evaluate(
          {
            "src/z.ts":
              'import { a } from "./a";\nexport function z(): void { a(); }\n',
            "src/a.ts":
              'import { z } from "./z";\nexport function a(): void { z(); }\n',
          },
          { applicable: true },
        );

        try {
          const a = idOf(context, "src/a.ts", "a", "function");
          const z = idOf(context, "src/z.ts", "z", "function");
          expect(result.violations).toHaveLength(1);
          expect(cyclePairs(result)).toEqual([
            [
              [a, z],
              [z, a],
            ],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
