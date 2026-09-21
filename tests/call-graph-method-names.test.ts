import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph method names", () => {
  it("resolves a string-literal method call", () => {
    const sources = {
      "service.ts": `
export class Service {
  "run"() {}
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

  it("resolves a computed method call with a statically-known key", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export class Service {
  [RUN]() {}
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

  it("resolves a call from inside a string-literal method", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  "run"() {
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

  it("resolves a call from inside a computed method with a statically-known key", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

const RUN = "run";

export class Service {
  [RUN]() {
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

  it("resolves a string-literal method through an interface-typed receiver", () => {
    const sources = {
      "service.ts": `
export interface S {
  "run"(): void;
}

export class C implements S {
  "run"() {}
}
`,
      "consumer.ts": `
import { S, C } from "./service";

export function consume() {
  const s: S = new C();
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
            line: 7,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("ignores a computed method when the key is not statically known", () => {
    const sources = {
      "service.ts": `
declare function getKey(): string;

export class Service {
  [getKey()]() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume() {
  const s = new Service();
  s["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});
