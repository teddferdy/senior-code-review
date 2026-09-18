import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph callers", () => {
  it("resolves a call from inside a class method", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  run() {
    helper();
  }
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "service.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves a call from inside an arrow function variable", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export const run = () => {
  helper();
};
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
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

  it("resolves a call from inside a function expression variable", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export const run = function () {
  helper();
};
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
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

  it("resolves a call from inside an object method", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export const service = {
  run() {
    helper();
  },
};
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
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
      ],
    });
  });

  it("resolves a call from inside an object property arrow function", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export const service = {
  run: () => {
    helper();
  },
};
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
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
      ],
    });
  });

  it("tracks a method caller and the nearest nested function inside a method", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  run() {
    function inner() {
      helper();
    }

    inner();
  }
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "inner",
            filePath: "service.ts",
            line: 6,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "service.ts",
            line: 7,
          },
        },
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callee: {
            symbolName: "inner",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "service.ts",
            line: 10,
          },
        },
      ],
    });
  });

  it("resolves a method-to-method call through this", () => {
    const sources = {
      "service.ts": `
export class Service {
  helper() {}

  run() {
    this.helper();
  }
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "run",
          filePath: "service.ts",
        }),
        callee: expect.objectContaining({
          symbolName: "helper",
          filePath: "service.ts",
        }),
      }),
    );
  });
});
