import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph parenthesized calls", () => {
  it("resolves a parenthesized method call", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service) {
  (s.run)();
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

  it("resolves a parenthesized free-function call", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consume() {
  (helper)();
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

  it("resolves a doubly-parenthesized method call without duplicate edges", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service) {
  ((s.run))();
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

  it("resolves a parenthesized element-access call", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service) {
  (s["run"])();
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

  it("resolves a parenthesized call on an interface-typed variable to the concrete implementation", () => {
    const sources = {
      "service.ts": `
export interface Service {
  getUser(): void;
}

export class UserService implements Service {
  getUser() {}
}
`,
      "consumer.ts": `
import { Service, UserService } from "./service";

export function consume() {
  const s: Service = new UserService();
  (s.getUser)();
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
            symbolName: "getUser",
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

  it("expands a parenthesized call on an interface-typed parameter to all implementations", () => {
    const sources = {
      "service.ts": `
export interface Service {
  getUser(): void;
}

export class UserService implements Service {
  getUser() {}
}

export class AdminService implements Service {
  getUser() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service) {
  (s.getUser)();
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
            symbolName: "getUser",
            filePath: "service.ts",
            line: 7,
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
            symbolName: "getUser",
            filePath: "service.ts",
            line: 11,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a parenthesized call from inside a class method", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "service.ts": `
import { helper } from "./helper";

export class Service {
  run() {
    (helper)();
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

  it("does not resolve a parenthesized element-access call when the key is not statically known", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service, key: string) {
  (s[key])();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});
