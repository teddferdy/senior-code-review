import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph optional element-access method calls", () => {
  it("resolves an optional-chaining element-access call on a nullable receiver", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s?: Service) {
  s?.["run"]();
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

  it("resolves an optional-chaining element-access call on a null-union receiver", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service | null) {
  s?.["run"]();
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

  it("resolves an optional-chaining element-access call with an identifier key on a nullable receiver", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

const KEY = "run";

export function consume(s?: Service) {
  s?.[KEY]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consume",
            filePath: "consumer.ts",
            line: 6,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("resolves an optional-chaining element-access call on an interface-typed optional parameter to the concrete implementation", () => {
    const sources = {
      "service.ts": `
export interface Service {
  run(): void;
}

export class UserService implements Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s?: Service) {
  s?.["run"]();
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
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file optional-chaining element-access call through a nullable receiver", () => {
    const sources = {
      "service.ts": `
export interface Service {
  run(): void;
}
`,
      "impl.ts": `
import { Service } from "./service";

export class ImplService implements Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";
import { ImplService } from "./impl";

export function consume(s?: Service) {
  s?.["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consume",
            filePath: "consumer.ts",
            line: 5,
          },
          callee: {
            symbolName: "run",
            filePath: "impl.ts",
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

  it("resolves an optional-chaining element-access call on an expression receiver", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}

export function getService(): Service | undefined {
  return undefined;
}
`,
      "consumer.ts": `
import { getService } from "./service";

export function consume() {
  getService()?.["run"]();
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
        {
          caller: {
            symbolName: "consume",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "getService",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("does not resolve an optional-chaining element-access call when the key is not statically known", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s?: Service, key: string) {
  s?.[key]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("keeps optional-chaining dot access on a nullable receiver resolved for parity", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s?: Service) {
  s?.run();
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