import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph property assignment wrappers", () => {
  it("resolves an object property arrow function with as-string computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" as const]: () => {},
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

  it("resolves an object property arrow function with satisfies-string computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" satisfies string]: () => {},
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

  it("resolves an object property arrow function with parenthesized computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  [("run")]: () => {},
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

  it("resolves an object property arrow function with angle-bracket computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  [<const>"run"]: () => {},
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

  it("resolves an object property arrow function with identifier as-string computed key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN as const]: () => {},
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
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object property arrow function with non-null-asserted identifier key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN!]: () => {},
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
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object property arrow function with numeric as-number computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  [42 as const]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consume() {
  service[42]();
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
            symbolName: "42",
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

  it("resolves a function expression with wrapped computed key", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run" as const]: function () {},
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
});
