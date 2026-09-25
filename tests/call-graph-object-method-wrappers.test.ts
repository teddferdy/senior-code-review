import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph object method wrappers", () => {
  it("resolves an object method with as-const computed key and its caller", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" as const]() {
    helper();
  }
};

export function helper() {}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callee: {
            symbolName: "helper",
            filePath: "service.ts",
            line: 8,
          },
          callSite: {
            filePath: "service.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an object method with satisfies-string computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" satisfies string]() {
    helper();
  }
};

export function helper() {}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callee: {
            symbolName: "helper",
            filePath: "service.ts",
            line: 8,
          },
          callSite: {
            filePath: "service.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an object method with parenthesized computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  [("run")]() {
    helper();
  }
};

export function helper() {}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callee: {
            symbolName: "helper",
            filePath: "service.ts",
            line: 8,
          },
          callSite: {
            filePath: "service.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an object method with angle-bracket computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  [<const>"run"]() {
    helper();
  }
};

export function helper() {}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callee: {
            symbolName: "helper",
            filePath: "service.ts",
            line: 8,
          },
          callSite: {
            filePath: "service.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an object method with identifier as-const computed key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN as const]() {
    helper();
  }
};

export function helper() {}
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
            filePath: "service.ts",
            line: 10,
          },
          callSite: {
            filePath: "service.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves an object method with non-null-asserted identifier key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN!]() {
    helper();
  }
};

export function helper() {}
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
            filePath: "service.ts",
            line: 10,
          },
          callSite: {
            filePath: "service.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves a cross-file call to an object method defined with wrapper key via dot access", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" as const]() {}
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consume() {
  service.run();
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

  it("resolves a cross-file call to an object method defined with wrapper key via element access", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" as const]() {}
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consume() {
  service["run"]();
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
});
