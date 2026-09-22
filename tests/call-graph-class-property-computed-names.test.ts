import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph class property computed names", () => {
  it("resolves a class property arrow function with string-literal name", () => {
    const sources = {
      "service.ts": `
export class Service {
  "run" = () => {};
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

  it("resolves a class property arrow function with numeric-literal name via element access", () => {
    const sources = {
      "service.ts": `
export class Service {
  42 = () => {};
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume() {
  const s = new Service();
  s[42]();
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
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves a class property arrow function with computed string-literal name", () => {
    const sources = {
      "service.ts": `
export class Service {
  ["run"] = () => {};
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

  it("resolves a class property arrow function with computed identifier key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export class Service {
  [RUN] = () => {};
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
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves a static class property arrow function with string-literal name", () => {
    const sources = {
      "service.ts": `
export class Service {
  static "run" = () => {};
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

  it("resolves a static class property arrow function with computed identifier key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export class Service {
  static [RUN] = () => {};
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

  it("resolves a call from inside a string-literal class property arrow function", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  "run" = () => {
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

  it("resolves a call from inside a computed class property arrow function", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

const RUN = "run";

export class Service {
  [RUN] = () => {
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
            line: 7,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "service.ts",
            line: 8,
          },
        },
      ],
    });
  });

  it("resolves a class property function expression with string-literal name", () => {
    const sources = {
      "service.ts": `
export class Service {
  "run" = function() {};
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
});
