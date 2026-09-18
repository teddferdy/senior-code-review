import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph class property functions", () => {
  it("resolves a class property arrow function call across files", () => {
    const sources = {
      "service.ts": `
export class Service {
  run = () => {};
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume() {
  const s = new Service();
  s.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consume",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves a class property function expression call", () => {
    const sources = {
      "service.ts": `
export class Service {
  run = function () {};
}

export function consume() {
  const s = new Service();
  s.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consume",
            filePath: "service.ts",
            line: 6,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "service.ts",
            line: 8,
          },
        },
      ],
    });
  });

  it("resolves a call from inside a class property arrow function", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  run = () => {
    helper();
  };
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

  it("resolves a method-to-property call through this", () => {
    const sources = {
      "service.ts": `
export class Service {
  helper = () => {};

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

  it("resolves a static class property arrow function call", () => {
    const sources = {
      "service.ts": `
export class Service {
  static run = () => {};
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume() {
  Service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consume",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("ignores a call to a non-function class property", () => {
    const sources = {
      "service.ts": `
export class Service {
  count = 42;
}

export function consume() {
  const s = new Service();
  s.count();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});
