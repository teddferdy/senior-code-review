import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type {
  CanonicalPath,
  DeclarationId,
} from "../src/repository/declaration-ids.js";
import { evaluateRevArch001 } from "../src/repository/rev-arch-001.js";
import type { RevCallbound001Result } from "../src/repository/rev-callbound-001.js";
import {
  evaluateRevCallbound001,
  isRevCallbound001Violation,
} from "../src/repository/rev-callbound-001.js";
import type { V1CallEdge } from "../src/repository/v1-call-graph.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevCallbound001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevCallbound001(context, options) };
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
  context: AnalysisContext,
  callerId: DeclarationId,
  calleeId: DeclarationId,
): V1CallEdge {
  const graph = buildV1CallGraph(context);
  const found = graph.edges.find(
    (edge) => edge.callerId === callerId && edge.calleeId === calleeId,
  );

  if (!found) {
    throw new Error("missing expected V1 call edge");
  }

  return found;
}

const TRANSITIVE_NAMED = {
  "src/repository/a.ts":
    'import { go } from "./inter";\nexport function start() {\n  go();\n}\n',
  "src/repository/inter.ts": 'export { go } from "../ui/target";\n',
  "src/ui/target.ts": "export function go() {}\n",
};

describe("REV-CALLBOUND-001 transitive boundary-crossing call review", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when applicability is omitted",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED);

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
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
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
      "03 evaluates when applicability is exactly true",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
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
      "04 produces no evaluation for any non-boolean applicability value",
      () => {
        const values: unknown[] = [0, 1, "true", null, {}, []];

        for (const value of values) {
          const { context, result } = evaluate(TRANSITIVE_NAMED, {
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

  describe("exclusions", () => {
    it(
      "05 excludes same-file calls",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              "export function bar() {}\nexport function foo() {\n  bar();\n}\n",
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
      "06 excludes direct boundary calls reported by REV-ARCH-001",
      () => {
        const sources = {
          "src/repository/a.ts":
            'import { go } from "../ui/target";\nexport function start() {\n  go();\n}\n',
          "src/ui/target.ts": "export function go() {}\n",
        };
        const { context, result } = evaluate(sources, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.evaluated).toBe(true);
          expect(arch.violations).toHaveLength(1);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports a transitive call through a boundary-violating leg",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });

          expect(arch.evaluated).toBe(true);
          expect(arch.violations).toHaveLength(1);
          expect(arch.violations[0]).toMatchObject({
            source: "src/repository/inter.ts",
            target: "src/ui/target.ts",
          });
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.callerFile).toBe(
            "src/repository/a.ts",
          );
          expect(result.violations[0]?.calleeFile).toBe("src/ui/target.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 excludes bundles of duplicate direct boundary edges",
      () => {
        const sources = {
          "src/repository/a.ts":
            'import { go } from "../ui/target";\nimport { go } from "../ui/target";\nexport function start() {\n  go();\n}\n',
          "src/ui/target.ts": "export function go() {}\n",
        };
        const { context, result } = evaluate(sources, {
          applicable: true,
        });

        try {
          const arch = evaluateRevArch001(context, { applicable: true });
          const direct = context
            .allModuleEdges()
            .filter(
              (edge) =>
                edge.from === "src/repository/a.ts" &&
                edge.to === "src/ui/target.ts",
            );

          expect(direct).toHaveLength(2);
          expect(arch.violations).toHaveLength(2);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("chain leg position", () => {
    it(
      "09 reports a violation on the first chain leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../ui/mid";\nexport function start() {\n  go();\n}\n',
            "src/ui/mid.ts": 'export { go } from "../lib/deep";\n',
            "src/lib/deep.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.callerFile).toBe(
            "src/repository/a.ts",
          );
          expect(result.violations[0]?.calleeFile).toBe("src/lib/deep.ts");
          expect(
            result.violations[0]?.chain.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/ui/mid.ts"],
            ["src/ui/mid.ts", "src/lib/deep.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 reports a violation on a middle chain leg",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nexport function start() {\n  go();\n}\n',
            "src/repository/m1.ts": 'export { go } from "../ui/m2";\n',
            "src/ui/m2.ts": 'export { go } from "../lib/z";\n',
            "src/lib/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.callerFile).toBe(
            "src/repository/a.ts",
          );
          expect(result.violations[0]?.calleeFile).toBe("src/lib/z.ts");
          expect(
            result.violations[0]?.chain.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/repository/m1.ts"],
            ["src/repository/m1.ts", "src/ui/m2.ts"],
            ["src/ui/m2.ts", "src/lib/z.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "11 reports a violation on the final chain leg",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          const chain = result.violations[0]?.chain ?? [];

          expect(chain).toHaveLength(2);
          expect(chain[chain.length - 1]).toEqual({
            from: "src/repository/inter.ts",
            to: "src/ui/target.ts",
            rawSpecifier: "../ui/target",
            kind: "runtime",
            via: "export-from",
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 reports nothing for a multi-hop chain without a violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../lib/m";\nexport function start() {\n  go();\n}\n',
            "src/lib/m.ts": 'export { go } from "./z";\n',
            "src/lib/z.ts": "export function go() {}\n",
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
      "13 produces one violation for a chain with two violating legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../ui/m";\nexport function start() {\n  go();\n}\n',
            "src/ui/m.ts": 'export { go } from "../repository/n";\n',
            "src/repository/n.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.callerFile).toBe(
            "src/repository/a.ts",
          );
          expect(result.violations[0]?.calleeFile).toBe("src/ui/z.ts");
          expect(result.violations[0]?.chain).toHaveLength(3);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("empty and missing relationships", () => {
    it(
      "14 reports nothing for an unlicensed import-then-reexport chain",
      () => {
        const sources = {
          "src/repository/a.ts":
            'import { x } from "./b";\nexport function foo() {\n  x();\n}\n',
          "src/repository/b.ts":
            'import { x } from "./c";\nexport { x };\n',
          "src/repository/c.ts": "export function x() {}\n",
        };
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources,
        });

        try {
          const graph = buildV1CallGraph(context);
          const edge = graph.edges.find(
            (entry) =>
              entry.callerId ===
                idOf(context, "src/repository/a.ts", "foo", "function") &&
              entry.calleeId ===
                idOf(context, "src/repository/c.ts", "x", "function"),
          );

          expect(edge).toBeDefined();

          const result = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 reports nothing for script-global cross-file calls",
      () => {
        const sources = {
          "src/a.ts": "function foo() {\n  bar();\n}\n",
          "src/b.ts": "function bar() {}\n",
        };
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources,
        });

        try {
          const graph = buildV1CallGraph(context);
          const edge = graph.edges.find(
            (entry) =>
              entry.callerId ===
                idOf(context, "src/a.ts", "foo", "function") &&
              entry.calleeId ===
                idOf(context, "src/b.ts", "bar", "function"),
          );

          expect(edge).toBeDefined();

          const result = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 returns false for stale or foreign call edges",
      () => {
        const { context } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const callee = idOf(context, "src/ui/target.ts", "go", "function");
          const staleCaller: V1CallEdge = {
            callerId: "decl:missing:0-0:function:missing#0" as DeclarationId,
            calleeId: callee,
            callSite: { file: "src/repository/a.ts" as CanonicalPath, line: 1 },
          };
          const caller = idOf(
            context,
            "src/repository/a.ts",
            "start",
            "function",
          );
          const staleCallee: V1CallEdge = {
            callerId: caller,
            calleeId: "decl:missing:0-0:function:missing#0" as DeclarationId,
            callSite: { file: "src/repository/a.ts" as CanonicalPath, line: 1 },
          };

          expect(isRevCallbound001Violation(context, staleCaller)).toBe(false);
          expect(isRevCallbound001Violation(context, staleCallee)).toBe(false);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("barrels and aliases", () => {
    it(
      "17 reports barrel crossings through export-star legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./barrel";\nexport function start() {\n  go();\n}\n',
            "src/repository/barrel.ts": 'export * from "../ui/impl";\n',
            "src/ui/impl.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.calleeFile).toBe("src/ui/impl.ts");
          expect(
            result.violations[0]?.chain.map((entry) => entry.via),
          ).toEqual(["import", "export-star"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 reports multi-hop barrel relationships",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./b1";\nexport function start() {\n  go();\n}\n',
            "src/repository/b1.ts": 'export { go } from "./b2";\n',
            "src/repository/b2.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.chain.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/repository/b1.ts"],
            ["src/repository/b1.ts", "src/repository/b2.ts"],
            ["src/repository/b2.ts", "src/ui/z.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "19 reports alias-licensed renamed re-export relationships",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { y } from "./barrel";\nexport function start() {\n  y();\n}\n',
            "src/repository/barrel.ts": 'export { go as y } from "../ui/deep";\n',
            "src/ui/deep.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.calleeFile).toBe("src/ui/deep.ts");
          expect(result.violations[0]?.chain[1]).toEqual({
            from: "src/repository/barrel.ts",
            to: "src/ui/deep.ts",
            rawSpecifier: "../ui/deep",
            kind: "runtime",
            via: "export-from",
          });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "20 ignores non-boundary decoy re-export legs",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { target } from "./barrel";\nexport function start() {\n  target();\n}\n',
            "src/repository/barrel.ts":
              'export { target } from "../ui/b";\nexport { decoy } from "../lib/c";\n',
            "src/ui/b.ts": "export function target() {}\n",
            "src/lib/c.ts": "export function decoy() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.chain.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/repository/barrel.ts"],
            ["src/repository/barrel.ts", "src/ui/b.ts"],
          ]);
          expect(
            result.violations[0]?.chain.some(
              (entry) => entry.to === "src/lib/c.ts",
            ),
          ).toBe(false);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "21 does not treat ui-kit topology as a boundary violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m";\nexport function start() {\n  go();\n}\n',
            "src/repository/m.ts": 'export { go } from "../ui-kit/z";\n',
            "src/ui-kit/z.ts": "export function go() {}\n",
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
      "22 does not treat repository-extra sources as boundary sources",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../repository-extra/m";\nexport function start() {\n  go();\n}\n',
            "src/repository-extra/m.ts": 'export { go } from "../ui/z";\n',
            "src/ui/z.ts": "export function go() {}\n",
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

  describe("edge kinds", () => {
    it(
      "23 preserves runtime kinds across the violating chain",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(
            result.violations[0]?.chain.map((entry) => entry.kind),
          ).toEqual(["runtime", "runtime"]);
          expect(
            result.violations[0]?.chain.map((entry) => entry.via),
          ).toEqual(["import", "export-from"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 reports chains whose violating leg is type-only",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import type { go } from "../ui/inter";\nexport function start() {\n  go();\n}\n',
            "src/ui/inter.ts": 'export { go } from "../lib/z";\n',
            "src/lib/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.chain[0]?.kind).toBe("type-only");
          expect(result.violations[0]?.calleeFile).toBe("src/lib/z.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 reports nothing for unresolved and external calls",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { missing } from "./missing";\nimport { join } from "node:path";\nexport function foo() {\n  missing();\n  join("x");\n}\n',
          },
          { applicable: true },
        );

        try {
          const edges = context.allModuleEdges();

          expect(edges.map((edge) => edge.kind).sort()).toEqual([
            "external",
            "unresolved",
          ]);
          expect(result.evaluated).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "26 orders violations by caller file across multiple calls",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/alpha.ts":
              'import { aFn } from "./iA";\nexport function startA() {\n  aFn();\n}\n',
            "src/repository/iA.ts": 'export { aFn } from "../ui/tA";\n',
            "src/ui/tA.ts": "export function aFn() {}\n",
            "src/repository/zeta.ts":
              'import { zFn } from "./iZ";\nexport function startZ() {\n  zFn();\n}\n',
            "src/repository/iZ.ts": 'export { zFn } from "../ui/tZ";\n',
            "src/ui/tZ.ts": "export function zFn() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(
            result.violations.map((violation) => violation.callerFile),
          ).toEqual(["src/repository/alpha.ts", "src/repository/zeta.ts"]);
          expect(
            result.violations.map((violation) => violation.calleeFile),
          ).toEqual(["src/ui/tA.ts", "src/ui/tZ.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 produces equivalent and independent results on repeated evaluation",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const again = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(JSON.stringify(result));
          expect(again).not.toBe(result);
          expect(again.violations).not.toBe(result.violations);
          expect(again.violations[0]).not.toBe(result.violations[0]);
          expect(again.violations[0]?.callSite).not.toBe(
            result.violations[0]?.callSite,
          );
          expect(again.violations[0]?.chain).not.toBe(
            result.violations[0]?.chain,
          );
          expect(again.violations[0]?.chain[0]).not.toBe(
            result.violations[0]?.chain[0],
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "28 leaves serialized context state unchanged",
      () => {
        const context = new AnalysisContextImpl({
          repositoryRoot: "/repo",
          sources: TRANSITIVE_NAMED,
        });

        try {
          const before = JSON.stringify(context.allModuleEdges());

          const result = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(result.violations).toHaveLength(1);
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);

          const again = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(JSON.stringify(result));
          expect(JSON.stringify(context.allModuleEdges())).toBe(before);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("mutation safety", () => {
    it(
      "29 isolates subsequent evaluation from chain mutation",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const expected = JSON.stringify(result);
          const chain = result.violations[0]?.chain as
            | { from: string }[]
            | undefined;

          expect(chain).toBeDefined();

          if (chain?.[0]) {
            chain[0].from = "changed";
          }

          chain?.push({ from: "changed" });

          const again = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(expected);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 isolates subsequent evaluation from call-site mutation",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const expected = JSON.stringify(result);
          const callSite = result.violations[0]?.callSite as
            | { file: string; line: number }
            | undefined;

          expect(callSite).toBeDefined();

          if (callSite) {
            callSite.file = "changed";
            callSite.line = 999;
          }

          const again = evaluateRevCallbound001(context, {
            applicable: true,
          });

          expect(JSON.stringify(again)).toBe(expected);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("evidence", () => {
    it(
      "31 preserves the exact violation shape",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toEqual([
            {
              callerFile: "src/repository/a.ts",
              calleeFile: "src/ui/target.ts",
              callSite: { file: "src/repository/a.ts", line: 3 },
              boundary: "REV-ARCH-001: src/repository/** -> src/ui/**",
              chain: [
                {
                  from: "src/repository/a.ts",
                  to: "src/repository/inter.ts",
                  rawSpecifier: "./inter",
                  kind: "runtime",
                  via: "import",
                },
                {
                  from: "src/repository/inter.ts",
                  to: "src/ui/target.ts",
                  rawSpecifier: "../ui/target",
                  kind: "runtime",
                  via: "export-from",
                },
              ],
            },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 carries the exact REV-ARCH-001 boundary value",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.boundary).toBe(
            "REV-ARCH-001: src/repository/** -> src/ui/**",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 records the exact call-site file and line",
      () => {
        const { context, result } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const callSite = result.violations[0]?.callSite;

          expect(callSite?.file).toBe("src/repository/a.ts");
          expect(callSite?.line).toBe(3);
          expect(typeof callSite?.line).toBe("number");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 preserves full chain order for three-hop relationships",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./m1";\nexport function start() {\n  go();\n}\n',
            "src/repository/m1.ts": 'export { go } from "../ui/m2";\n',
            "src/ui/m2.ts": 'export { go } from "../lib/z";\n',
            "src/lib/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(
            result.violations[0]?.chain.map((entry) => [
              entry.from,
              entry.to,
            ]),
          ).toEqual([
            ["src/repository/a.ts", "src/repository/m1.ts"],
            ["src/repository/m1.ts", "src/ui/m2.ts"],
            ["src/ui/m2.ts", "src/lib/z.ts"],
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("multiple calls", () => {
    it(
      "35 reports only the qualifying call among unrelated calls",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/q.ts":
              'import { goq } from "./qi";\nexport function startQ() {\n  goq();\n}\n',
            "src/repository/qi.ts": 'export { goq } from "../ui/qt";\n',
            "src/ui/qt.ts": "export function goq() {}\n",
            "src/repository/s.ts":
              "export function helper() {}\nexport function useHelper() {\n  helper();\n}\n",
            "src/repository/d.ts":
              'import { god } from "../ui/dt";\nexport function startD() {\n  god();\n}\n',
            "src/ui/dt.ts": "export function god() {}\n",
            "src/repository/n.ts":
              'import { gon } from "../lib/nm";\nexport function startN() {\n  gon();\n}\n',
            "src/lib/nm.ts": 'export { gon } from "./nz";\n',
            "src/lib/nz.ts": "export function gon() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.callerFile).toBe(
            "src/repository/q.ts",
          );
          expect(result.violations[0]?.calleeFile).toBe("src/ui/qt.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "36 reports independent violations for independent qualifying calls",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "./inter";\nexport function start() {\n  go();\n}\n',
            "src/repository/inter.ts": 'export { go } from "../ui/target";\n',
            "src/ui/target.ts": "export function go() {}\n",
            "src/repository/p.ts":
              'import { run } from "./pi";\nexport function begin() {\n  run();\n}\n',
            "src/repository/pi.ts": 'export { run } from "../ui/pt";\n',
            "src/ui/pt.ts": "export function run() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(
            result.violations.map((violation) => violation.callerFile),
          ).toEqual(["src/repository/a.ts", "src/repository/p.ts"]);
          expect(
            result.violations.map((violation) => violation.calleeFile),
          ).toEqual(["src/ui/target.ts", "src/ui/pt.ts"]);
          expect(result.violations[0]).not.toBe(result.violations[1]);
          expect(result.violations[0]?.chain).not.toBe(
            result.violations[1]?.chain,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 reports star-mediated crossings with a first-leg violation",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { go } from "../ui/barrel";\nexport function start() {\n  go();\n}\n',
            "src/ui/barrel.ts": 'export * from "../lib/z";\n',
            "src/lib/z.ts": "export function go() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(1);
          expect(result.violations[0]?.calleeFile).toBe("src/lib/z.ts");
          expect(
            result.violations[0]?.chain.map((entry) => entry.via),
          ).toEqual(["import", "export-star"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "38 evaluates the unit predicate for genuine call edges",
      () => {
        const { context } = evaluate(TRANSITIVE_NAMED, {
          applicable: true,
        });

        try {
          const qualifying = edgeOf(
            context,
            idOf(context, "src/repository/a.ts", "start", "function"),
            idOf(context, "src/ui/target.ts", "go", "function"),
          );

          expect(isRevCallbound001Violation(context, qualifying)).toBe(true);
        } finally {
          finish(context);
        }

        const sameFile = evaluate(
          {
            "src/repository/a.ts":
              "export function bar() {}\nexport function foo() {\n  bar();\n}\n",
          },
          { applicable: true },
        );

        try {
          const edge = edgeOf(
            sameFile.context,
            idOf(sameFile.context, "src/repository/a.ts", "foo", "function"),
            idOf(sameFile.context, "src/repository/a.ts", "bar", "function"),
          );

          expect(isRevCallbound001Violation(sameFile.context, edge)).toBe(
            false,
          );
        } finally {
          finish(sameFile.context);
        }
      },
      30000,
    );

    it(
      "39 reports nothing for reverse-direction chains into the repository",
      () => {
        const { context, result } = evaluate(
          {
            "src/ui/a.ts":
              'import { go } from "./m";\nexport function start() {\n  go();\n}\n',
            "src/ui/m.ts": 'export { go } from "../repository/z";\n',
            "src/repository/z.ts": "export function go() {}\n",
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
      "40 reports two violations for one caller at two call sites",
      () => {
        const { context, result } = evaluate(
          {
            "src/repository/a.ts":
              'import { g1 } from "./inter1";\nimport { g2 } from "./inter2";\nexport function start() {\n  g1();\n  g2();\n}\n',
            "src/repository/inter1.ts": 'export { g1 } from "../ui/t1";\n',
            "src/ui/t1.ts": "export function g1() {}\n",
            "src/repository/inter2.ts": 'export { g2 } from "../ui/t2";\n',
            "src/ui/t2.ts": "export function g2() {}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.violations).toHaveLength(2);
          expect(
            result.violations.map((violation) => violation.callerFile),
          ).toEqual(["src/repository/a.ts", "src/repository/a.ts"]);
          expect(
            result.violations.map((violation) => violation.calleeFile),
          ).toEqual(["src/ui/t1.ts", "src/ui/t2.ts"]);
          expect(
            result.violations.map((violation) => violation.callSite.line),
          ).toEqual([4, 5]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
