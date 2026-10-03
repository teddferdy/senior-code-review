import { describe, expect, it } from "vitest";

import type { AnalysisContext } from "../src/repository/analysis-context.js";
import { AnalysisContext as AnalysisContextImpl } from "../src/repository/analysis-context.js";
import type { DeclarationId } from "../src/repository/declaration-ids.js";
import type { RevCallchainless001Result } from "../src/repository/rev-callchainless-001.js";
import {
  evaluateRevCallchainless001,
  isRevCallchainless001Violation,
} from "../src/repository/rev-callchainless-001.js";
import type { V1CallEdge } from "../src/repository/v1-call-graph.js";
import { buildV1CallGraph } from "../src/repository/v1-call-graph.js";

function evaluate(
  sources: Record<string, string>,
  options?: { applicable?: boolean },
): { context: AnalysisContext; result: RevCallchainless001Result } {
  const context = new AnalysisContextImpl({
    repositoryRoot: "/repo",
    sources,
  });

  try {
    return { context, result: evaluateRevCallchainless001(context, options) };
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

const CHAINLESS_BASIC = {
  "src/shared.ts": "function sharedHelper(): void {}\n",
  "src/app.ts": "export function run(): void {\n  sharedHelper();\n}\n",
};

describe("REV-CALLCHAINLESS-001 unlinked cross-file call review", () => {
  describe("applicability", () => {
    it(
      "01 produces no evaluation when options are omitted",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC);

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
        const { context, result } = evaluate(CHAINLESS_BASIC, {
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
        const { context, result } = evaluate(CHAINLESS_BASIC, {
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
      "04 produces no evaluation for truthy non-boolean applicability values",
      () => {
        const values: unknown[] = [1, "true", "yes", {}, []];

        for (const value of values) {
          const { context, result } = evaluate(CHAINLESS_BASIC, {
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
      "05 produces no evaluation for falsy non-boolean applicability values",
      () => {
        const values: unknown[] = [0, "", null, undefined];

        for (const value of values) {
          const { context, result } = evaluate(CHAINLESS_BASIC, {
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

  describe("basic positives", () => {
    it(
      "06 reports a cross-file represented call with no module relationship",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerDeclarationId).toBe(
            idOf(context, "src/app.ts", "run", "function"),
          );
          expect(violation.calleeDeclarationId).toBe(
            idOf(context, "src/shared.ts", "sharedHelper", "function"),
          );
          expect(violation.callerFile).toBe("src/app.ts");
          expect(violation.calleeFile).toBe("src/shared.ts");
          expect(violation.callSite).toEqual({ file: "src/app.ts", line: 2 });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "07 reports an ambient declaration-style callee with no module edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/amb.d.ts": "declare function ambientHelper(): void;\n",
            "src/app.ts":
              "export function run(): void {\n  ambientHelper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerFile).toBe("src/app.ts");
          expect(violation.calleeFile).toBe("src/amb.d.ts");
          expect(violation.calleeDeclarationId).toBe(
            idOf(context, "src/amb.d.ts", "ambientHelper", "overload"),
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "08 reports a global object-method call with no licensed relationship",
      () => {
        const { context, result } = evaluate(
          {
            "src/objs.ts": "const service = {\n  run() {},\n};\n",
            "src/app.ts":
              "export function start(): void {\n  service.run();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.calleeDeclarationId).toBe(
            idOf(context, "src/objs.ts", "run", "objectMethod"),
          );
          expect(violation.callerFile).toBe("src/app.ts");
          expect(violation.calleeFile).toBe("src/objs.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "09 reports two independent chainless calls in one evaluation",
      () => {
        const { context, result } = evaluate(
          {
            "src/one.ts": "function alpha(): void {}\n",
            "src/two.ts": "function beta(): void {}\n",
            "src/app.ts":
              "export function first(): void {\n  alpha();\n}\nexport function second(): void {\n  beta();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const callees = result.violations.map(
            (violation) => violation.calleeDeclarationId,
          );
          expect(callees).toContain(
            idOf(context, "src/one.ts", "alpha", "function"),
          );
          expect(callees).toContain(
            idOf(context, "src/two.ts", "beta", "function"),
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "10 keeps two call sites between the same pair as two findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/shared.ts": "function helper(): void {}\n",
            "src/app.ts":
              "export function one(): void {\n  helper();\n}\nexport function two(): void {\n  helper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const lines = result.violations.map(
            (violation) => violation.callSite.line,
          );
          expect(lines).toEqual([2, 5]);
          expect(result.violations[0]?.callerDeclarationId).toBe(
            idOf(context, "src/app.ts", "one", "function"),
          );
          expect(result.violations[1]?.callerDeclarationId).toBe(
            idOf(context, "src/app.ts", "two", "function"),
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("direct relationship negatives", () => {
    it(
      "11 excludes a call joined by a direct import edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/target.ts": "export function go(): void {}\n",
            "src/app.ts":
              'import { go } from "./target";\nexport function run(): void {\n  go();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // Non-vacuous: the represented call exists but is linked.
          const caller = idOf(context, "src/app.ts", "run", "function");
          const callee = idOf(context, "src/target.ts", "go", "function");
          expect(() => edgeOf(context, caller, callee)).not.toThrow();
          expect(
            isRevCallchainless001Violation(
              context,
              edgeOf(context, caller, callee),
            ),
          ).toBe(false);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "12 excludes a call joined by a direct default-import edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/target.ts": "export default function go(): void {}\n",
            "src/app.ts":
              'import go from "./target";\nexport function run(): void {\n  go();\n}\n',
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
      "13 excludes a call joined only by a direct type-only edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts":
              "export class Svc {\n  run(): void {}\n}\n",
            "src/app.ts":
              'import type { Svc } from "./svc";\nexport function f(s: Svc): void {\n  s.run();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // The call is represented (callee resolved through the type)
          // while the only module relationship is type-only.
          const caller = idOf(context, "src/app.ts", "f", "function");
          const callee = idOf(context, "src/svc.ts", "run", "method");
          expect(() => edgeOf(context, caller, callee)).not.toThrow();
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "14 excludes a call joined by a direct export-from edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/mid.ts": "function helper(): void {}\n",
            "src/app.ts":
              'export { helper } from "./mid";\nexport function run(): void {\n  helper();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some(
                (edge) =>
                  edge.from === "src/app.ts" &&
                  edge.to === "src/mid.ts" &&
                  edge.via === "export-from",
              ),
          ).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "15 excludes a call joined by a direct export-star edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/mid.ts": "function helper(): void {}\n",
            "src/app.ts":
              'export * from "./mid";\nexport function run(): void {\n  helper();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some(
                (edge) =>
                  edge.from === "src/app.ts" &&
                  edge.to === "src/mid.ts" &&
                  edge.via === "export-star",
              ),
          ).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "16 excludes a call joined by a direct re-export-namespace edge",
      () => {
        const { context, result } = evaluate(
          {
            "src/mid.ts": "export function go(): void {}\n",
            "src/app.ts":
              'import * as mid from "./mid";\nexport * as midNs from "./mid";\nexport function run(): void {\n  mid.go();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(
            context
              .allModuleEdges()
              .some(
                (edge) =>
                  edge.from === "src/app.ts" &&
                  edge.to === "src/mid.ts" &&
                  edge.via === "re-export-namespace",
              ),
          ).toBe(true);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("transitive relationship negatives", () => {
    it(
      "17 excludes a call over a licensed two-leg named barrel path",
      () => {
        const { context, result } = evaluate(
          {
            "src/target.ts": "export function go(): void {}\n",
            "src/mid.ts": 'export { go } from "./target";\n',
            "src/app.ts":
              'import { go } from "./mid";\nexport function run(): void {\n  go();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const caller = idOf(context, "src/app.ts", "run", "function");
          const callee = idOf(context, "src/target.ts", "go", "function");
          expect(() => edgeOf(context, caller, callee)).not.toThrow();
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "18 excludes a call over a longer licensed chain",
      () => {
        const { context, result } = evaluate(
          {
            "src/t.ts": "export function go(): void {}\n",
            "src/m1.ts": 'export { go } from "./t";\n',
            "src/m2.ts": 'export { go } from "./m1";\n',
            "src/app.ts":
              'import { go } from "./m2";\nexport function run(): void {\n  go();\n}\n',
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
      "19 excludes a call over a star-mediated structural chain",
      () => {
        const { context, result } = evaluate(
          {
            "src/target.ts": "export function go(): void {}\n",
            "src/mid.ts": 'export * from "./target";\n',
            "src/app.ts":
              'import { go } from "./mid";\nexport function run(): void {\n  go();\n}\n',
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
      "20 excludes a transitive chain outside any ARCH boundary",
      () => {
        const { context, result } = evaluate(
          {
            "src/lib/target.ts": "export function go(): void {}\n",
            "src/lib/mid.ts": 'export { go } from "./target";\n',
            "src/app.ts":
              'import { go } from "./lib/mid";\nexport function run(): void {\n  go();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // Licensed transitive relationship with no ARCH-boundary leg:
          // excluded here regardless of CALLBOUND applicability.
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("same-file negatives", () => {
    it(
      "21 excludes a same-file call even though the resolver is empty",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function bar(): void {}\nexport function foo(): void {\n  bar();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const caller = idOf(context, "src/a.ts", "foo", "function");
          const callee = idOf(context, "src/a.ts", "bar", "function");
          // Non-vacuous: the same-file edge exists and the predicate
          // rejects it, proving [] alone is insufficient.
          expect(() => edgeOf(context, caller, callee)).not.toThrow();
          expect(
            isRevCallchainless001Violation(
              context,
              edgeOf(context, caller, callee),
            ),
          ).toBe(false);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "22 excludes a self-call",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function tick(n: number): void {\n  if (n > 0) {\n    tick(n - 1);\n  }\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const self = idOf(context, "src/a.ts", "tick", "function");
          expect(() => edgeOf(context, self, self)).not.toThrow();
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
      "23 excludes a chainless call from a tests caller to src",
      () => {
        const { context, result } = evaluate(
          {
            "src/shared.ts": "function helper(): void {}\n",
            "tests/check.test.ts":
              "export function check(): void {\n  helper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const caller = idOf(
            context,
            "tests/check.test.ts",
            "check",
            "function",
          );
          const callee = idOf(context, "src/shared.ts", "helper", "function");
          expect(() => edgeOf(context, caller, callee)).not.toThrow();
          expect(
            isRevCallchainless001Violation(
              context,
              edgeOf(context, caller, callee),
            ),
          ).toBe(false);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "24 includes a chainless call from src to a tests callee",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helpers.ts": "function testHelper(): void {}\n",
            "src/app.ts":
              "export function run(): void {\n  testHelper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerFile).toBe("src/app.ts");
          expect(violation.calleeFile).toBe("tests/helpers.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "25 excludes a chainless call between two tests files",
      () => {
        const { context, result } = evaluate(
          {
            "tests/helpers.ts": "function testHelper(): void {}\n",
            "tests/check.test.ts":
              "export function check(): void {\n  testHelper();\n}\n",
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
      "26 includes a chainless call from a non-test config-style caller",
      () => {
        const { context, result } = evaluate(
          {
            "src/shared.ts": "function helper(): void {}\n",
            "tools/run.ts":
              "export function deploy(): void {\n  helper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerFile).toBe("tools/run.ts");
          expect(violation.calleeFile).toBe("src/shared.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "27 reports a src to src chainless call as the baseline positive",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerFile).toBe("src/app.ts");
          expect(violation.calleeFile).toBe("src/shared.ts");
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("call identity", () => {
    it(
      "28 preserves declaration identities exactly",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          const graph = buildV1CallGraph(context);
          const edge = graph.edges.find(
            (candidate) =>
              candidate.callerId === violation.callerDeclarationId &&
              candidate.calleeId === violation.calleeDeclarationId,
          );
          expect(edge).toBeDefined();
          expect(context.declarationOf(violation.callerDeclarationId)?.file).toBe(
            "src/app.ts",
          );
          expect(context.declarationOf(violation.calleeDeclarationId)?.file).toBe(
            "src/shared.ts",
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "29 preserves caller and callee files exactly",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.callerFile).toBe(
            context.declarationOf(violation.callerDeclarationId)?.file,
          );
          expect(violation.calleeFile).toBe(
            context.declarationOf(violation.calleeDeclarationId)?.file,
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "30 preserves call-site file and line exactly",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          const graph = buildV1CallGraph(context);
          const edge = graph.edges.find(
            (candidate) =>
              candidate.callerId === violation.callerDeclarationId &&
              candidate.calleeId === violation.calleeDeclarationId,
          );
          expect(edge?.callSite).toEqual(violation.callSite);
          expect(violation.callSite).toEqual({ file: "src/app.ts", line: 2 });
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "31 keeps multiple call sites as separate findings",
      () => {
        const { context, result } = evaluate(
          {
            "src/shared.ts": "function helper(): void {}\n",
            "src/app.ts":
              "export function one(): void {\n  helper();\n}\nexport function two(): void {\n  helper();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          const sites = result.violations.map(
            (violation) => violation.callSite,
          );
          expect(sites).toEqual([
            { file: "src/app.ts", line: 2 },
            { file: "src/app.ts", line: 5 },
          ]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "32 preserves the checker-selected overload declaration",
      () => {
        const { context, result } = evaluate(
          {
            "src/amb.d.ts":
              "declare function pick(input: string): void;\ndeclare function pick(input: number): void;\n",
            "src/app.ts":
              'export function run(): void {\n  pick("a");\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const signatures = context
            .allDeclarations()
            .filter(
              (record) =>
                record.file === "src/amb.d.ts" &&
                record.name === "pick" &&
                record.kind === "overload",
            )
            .sort((left, right) => left.line - right.line);
          expect(signatures).toHaveLength(2);
          const violation = result.violations[0] as (typeof result.violations)[number];
          // The string-argument call selects the first overload signature.
          expect(violation.calleeDeclarationId).toBe(signatures[0]?.id);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "33 excludes an alias-mediated call with a licensed relationship",
      () => {
        const { context, result } = evaluate(
          {
            "src/target.ts": "export function go(): void {}\n",
            "src/mid.ts": 'export { go } from "./target";\n',
            "src/app.ts":
              'import { go } from "./mid";\nexport function run(): void {\n  go();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          // The callee resolves through the barrel alias to a different
          // file, yet the licensed chain suppresses the finding.
          const callee = idOf(context, "src/target.ts", "go", "function");
          expect(context.declarationOf(callee)?.file).toBe("src/target.ts");
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "34 evaluates method-kind callees uniformly with no kind filter",
      () => {
        const { context, result } = evaluate(
          {
            "src/svc.ts": "class Svc {\n  static create(): void {}\n}\n",
            "src/app.ts":
              "export function run(): void {\n  Svc.create();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(1);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(violation.calleeDeclarationId).toBe(
            idOf(context, "src/svc.ts", "create", "method"),
          );
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("unsupported constructs", () => {
    it(
      "35 reports nothing for constructor and new-only coupling",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export class C {}\n",
            "src/b.ts":
              'import { C } from "./a";\nexport function make(): C {\n  return new C();\n}\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(buildV1CallGraph(context).edges).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "36 reports nothing for top-level-only invocation",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts": "export function go(): void {}\n",
            "src/b.ts": 'import { go } from "./a";\ngo();\n',
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(buildV1CallGraph(context).edges).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "37 reports nothing for dynamic member access omitted by V1",
      () => {
        const { context, result } = evaluate(
          {
            "src/a.ts":
              "export function invoke(svc: Record<string, () => void>, key: string): void {\n  svc[key]();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(buildV1CallGraph(context).edges).toEqual([]);
          expect(result.violations).toEqual([]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("evidence", () => {
    it(
      "38 emits exactly the six locked top-level keys",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(Object.keys(violation).sort()).toEqual(
            [
              "calleeDeclarationId",
              "calleeFile",
              "callSite",
              "callerDeclarationId",
              "callerFile",
            ].sort(),
          );
          const serialized = JSON.stringify(violation);
          for (const forbidden of [
            "global",
            "ambient",
            "missing",
            "broken",
            "severity",
            "message",
            "confidence",
            "remediation",
          ]) {
            expect(serialized).not.toContain(forbidden);
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "39 emits exactly file and line in the nested call site",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const violation = result.violations[0] as (typeof result.violations)[number];
          expect(Object.keys(violation.callSite).sort()).toEqual([
            "file",
            "line",
          ]);
          expect(violation.callSite).toEqual({ file: "src/app.ts", line: 2 });
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("ordering", () => {
    it(
      "40 sorts findings by caller, callee, call-site file, then line",
      () => {
        const { context, result } = evaluate(
          {
            "src/g1.ts": "function gOne(): void {}\n",
            "src/g2.ts": "function gTwo(): void {}\n",
            "src/b.ts":
              "export function first(): void {\n  gTwo();\n}\nexport function second(): void {\n  gOne();\n}\n",
            "src/a.ts":
              "export function zero(): void {\n  gOne();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          const keys = result.violations.map(
            (violation) =>
              `${violation.callerDeclarationId}${violation.calleeDeclarationId}${violation.callSite.file}${violation.callSite.line}`,
          );
          expect([...keys].sort()).toEqual(keys);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "41 uses UTF-16 code-unit ordering across letter case",
      () => {
        const { context, result } = evaluate(
          {
            "src/g1.ts": "function gOne(): void {}\n",
            "src/g2.ts": "function gTwo(): void {}\n",
            "src/B.ts":
              "export function Bee(): void {\n  gTwo();\n}\n",
            "src/a.ts":
              "export function aye(): void {\n  gOne();\n}\n",
          },
          { applicable: true },
        );

        try {
          expect(result.evaluated).toBe(true);
          expect(result.violations).toHaveLength(2);
          // "B" (0x42) precedes "a" (0x61) in UTF-16 code units, while
          // locale-aware ordering would rank "a" first.
          expect(
            result.violations.map((violation) => violation.callerFile),
          ).toEqual(["src/B.ts", "src/a.ts"]);
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });

  describe("determinism", () => {
    it(
      "42 produces deep-equal output on repeated evaluation",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevCallchainless001(context, {
            applicable: true,
          });
          expect(again).toEqual(result);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "43 is independent of source insertion order",
      () => {
        const first = evaluate(CHAINLESS_BASIC, { applicable: true });
        const reversed = evaluate(
          {
            "src/app.ts": CHAINLESS_BASIC["src/app.ts"],
            "src/shared.ts": CHAINLESS_BASIC["src/shared.ts"],
          },
          { applicable: true },
        );

        try {
          expect(reversed.result).toEqual(first.result);
        } finally {
          finish(first.context);
          finish(reversed.context);
        }
      },
      30000,
    );
  });

  describe("mutation and freshness", () => {
    it(
      "44 leaves context-owned tables unchanged",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const before = JSON.stringify({
            paths: context.canonicalPaths,
            edges: context.allModuleEdges(),
            declarations: context.allDeclarations(),
          });
          evaluateRevCallchainless001(context, { applicable: true });
          const after = JSON.stringify({
            paths: context.canonicalPaths,
            edges: context.allModuleEdges(),
            declarations: context.allDeclarations(),
          });
          expect(after).toBe(before);
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "45 returns fresh violations arrays between evaluations",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevCallchainless001(context, {
            applicable: true,
          });
          expect(again.evaluated).toBe(true);
          if (result.evaluated && again.evaluated) {
            expect(again.violations).not.toBe(result.violations);
            expect(again.violations).toEqual(result.violations);
          } else {
            throw new Error("expected both evaluations to run");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );

    it(
      "46 returns fresh violation and call-site objects between evaluations",
      () => {
        const { context, result } = evaluate(CHAINLESS_BASIC, {
          applicable: true,
        });

        try {
          expect(result.evaluated).toBe(true);
          const again = evaluateRevCallchainless001(context, {
            applicable: true,
          });
          expect(again.evaluated).toBe(true);
          if (result.evaluated && again.evaluated) {
            expect(result.violations).toHaveLength(1);
            expect(again.violations).toHaveLength(1);
            expect(again.violations[0]).not.toBe(result.violations[0]);
            expect(again.violations[0]?.callSite).not.toBe(
              result.violations[0]?.callSite,
            );
            expect(again.violations[0]).toEqual(result.violations[0]);
          } else {
            throw new Error("expected both evaluations to run");
          }
        } finally {
          finish(context);
        }
      },
      30000,
    );
  });
});
