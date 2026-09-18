import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph element-access method calls", () => {
  it("resolves an element-access call on an interface-typed variable to the concrete implementation", () => {
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
  s["getUser"]();
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

  it("expands an element-access call on an interface-typed parameter to all implementations", () => {
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
  s["getUser"]();
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

  it("resolves a cross-file element-access call on an interface-typed variable to the concrete implementation", () => {
    const sources = {
      "service.ts": `
export interface Service {
  getUser(): void;
}
`,
      "user.ts": `
import { Service } from "./service";

export class UserService implements Service {
  getUser() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";
import { UserService } from "./user";

export function consume() {
  const s: Service = new UserService();
  s["getUser"]();
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
            symbolName: "getUser",
            filePath: "user.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("does not resolve an element-access call when the key is not statically known", () => {
    const sources = {
      "service.ts": `
export class Service {
  getUser() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consume(s: Service, key: string) {
  s[key]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});