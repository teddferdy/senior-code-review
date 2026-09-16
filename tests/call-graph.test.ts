import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph.js";

describe("call graph", () => {
  it("builds a direct caller-to-callee edge", () => {
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

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "foo",
            filePath: "foo.ts",
            line: 2,
          },
        },
      ],
    });
  });

  it("builds multiple direct caller-to-callee edges in source order", () => {
    const sources = {
      "helpers.ts": `
export function helper() {}
`,
      "services.ts": `
import { helper } from "./helpers";

export function service() {
  helper();
}
`,
      "main.ts": `
import { service } from "./services";
import { helper } from "./helpers";

export function main() {
  service();
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "service",
            filePath: "services.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helpers.ts",
            line: 2,
          },
        },
        {
          caller: {
            symbolName: "main",
            filePath: "main.ts",
            line: 5,
          },
          callee: {
            symbolName: "service",
            filePath: "services.ts",
            line: 4,
          },
        },
        {
          caller: {
            symbolName: "main",
            filePath: "main.ts",
            line: 5,
          },
          callee: {
            symbolName: "helper",
            filePath: "helpers.ts",
            line: 2,
          },
        },
      ],
    });
  });
});
