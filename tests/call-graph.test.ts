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
          callSite: {
            filePath: "consumer.ts",
            line: 5,
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
          callSite: {
            filePath: "services.ts",
            line: 5,
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
          callSite: {
            filePath: "main.ts",
            line: 6,
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
          callSite: {
            filePath: "main.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("preserves duplicate direct calls as separate edges", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
  helper();
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
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("tracks the direct call site line", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
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
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("tracks the nearest nested function as the caller", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function outer() {
  function inner() {
    helper();
  }

  inner();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "inner",
            filePath: "consumer.ts",
            line: 5,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
        {
          caller: {
            symbolName: "outer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "inner",
            filePath: "consumer.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 9,
          },
        },
      ],
    });
  });

  it("ignores calls that do not resolve to indexed function declarations", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
  console.log("hello");
  Math.max(1, 2);
  unknownFunction();
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
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("tracks a recursive self-call as a self-edge", () => {
    const sources = {
      "factorial.ts": `
export function factorial(n: number) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "factorial",
            filePath: "factorial.ts",
            line: 2,
          },
          callee: {
            symbolName: "factorial",
            filePath: "factorial.ts",
            line: 2,
          },
          callSite: {
            filePath: "factorial.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an aliased imported function call", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper as runHelper } from "./helper";

export function consumer() {
  runHelper();
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
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });
});
