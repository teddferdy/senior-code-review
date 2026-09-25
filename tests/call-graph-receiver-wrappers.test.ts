import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph receiver wrappers", () => {
  // INTERFACE RECEIVER CASES

  it("resolves an interface method call with parenthesized receiver", () => {
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
  (s).getUser();
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

  it("resolves an interface method call with non-null asserted receiver", () => {
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
  s!.getUser();
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

  it("resolves an interface method call with as-expression receiver", () => {
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
  (s as Service).getUser();
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

  it("resolves an interface method call with satisfies-expression receiver", () => {
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
  (s satisfies Service).getUser();
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

  it("resolves an interface method call with angle-bracket type assertion receiver", () => {
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
  (<Service>s).getUser();
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

  it("resolves an interface method call with interleaved wrappers", () => {
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
  ((s as Service))!.getUser();
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

  it("resolves an interface method element-access call with wrapped receiver", () => {
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
  (s as Service)["getUser"]();
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

  // POLYMORPHIC RECEIVER CASES

  it("resolves a polymorphic method call with parenthesized receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  (service).getUser();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  it("resolves a polymorphic method call with non-null asserted receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  service!.getUser();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  it("resolves a polymorphic method call with as-expression receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  (service as UserService).getUser();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  it("resolves a polymorphic method call with satisfies-expression receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  (service satisfies UserService).getUser();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  it("resolves a polymorphic method call with angle-bracket assertion receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  (<UserService>service).getUser();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  it("resolves a polymorphic method element-access call with wrapped receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService, AdminService } from "./service";

export function consumer(service: UserService) {
  (service as UserService)["getUser"]();
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
            symbolName: "getUser",
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
            symbolName: "consumer",
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
      ],
    });
  });

  // CROSS-FILE

  it("resolves a cross-file interface and polymorphic call with wrapped receiver", () => {
    const sources = {
      "domain/types.ts": `
export interface IService {
  execute(): void;
}
`,
      "domain/base.ts": `
import { IService } from "./types";

export class BaseService implements IService {
  execute() {}
}
`,
      "domain/sub.ts": `
import { BaseService } from "./base";

export class SubService extends BaseService {
  execute() {}
}
`,
      "app/consumer.ts": `
import { IService } from "../domain/types";
import { BaseService } from "../domain/base";
import { SubService } from "../domain/sub";

export function consumeInterface() {
  const svc: IService = new BaseService();
  ((svc as IService))!.execute();
}

export function consumePolymorphic(svc: BaseService) {
  (svc as BaseService).execute();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumeInterface",
            filePath: "app/consumer.ts",
            line: 6,
          },
          callee: {
            symbolName: "execute",
            filePath: "domain/base.ts",
            line: 5,
          },
          callSite: {
            filePath: "app/consumer.ts",
            line: 8,
          },
        },
        {
          caller: {
            symbolName: "consumePolymorphic",
            filePath: "app/consumer.ts",
            line: 11,
          },
          callee: {
            symbolName: "execute",
            filePath: "domain/base.ts",
            line: 5,
          },
          callSite: {
            filePath: "app/consumer.ts",
            line: 12,
          },
        },
        {
          caller: {
            symbolName: "consumePolymorphic",
            filePath: "app/consumer.ts",
            line: 11,
          },
          callee: {
            symbolName: "execute",
            filePath: "domain/sub.ts",
            line: 5,
          },
          callSite: {
            filePath: "app/consumer.ts",
            line: 12,
          },
        },
      ],
    });
  });

  // NEGATIVE / BOUNDARY CASES

  it("does not resolve an interface implementation edge for a dynamic receiver", () => {
    const sources = {
      "service.ts": `
export interface Service {
  getUser(): void;
}

export class UserService implements Service {
  getUser() {}
}

declare function getService(): Service;

export function consume() {
  getService().getUser();
}
`,
    };

    const graph = buildCallGraph(sources);
    expect(graph.edges).not.toContainEqual(
      expect.objectContaining({
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
        }),
      }),
    );
  });

  it("preserves nominal isolation for polymorphic dispatch with wrapped receiver", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {
  getUser() {}
}

export class AuditService {
  getUser() {}
}

export function consumer(service: UserService) {
  (service as UserService).getUser();
}
`,
    };

    const graph = buildCallGraph(sources);

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({ symbolName: "consumer" }),
        callee: expect.objectContaining({ symbolName: "getUser", line: 3 }),
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({ symbolName: "consumer" }),
        callee: expect.objectContaining({ symbolName: "getUser", line: 7 }),
      }),
    );
    expect(graph.edges).not.toContainEqual(
      expect.objectContaining({
        callee: expect.objectContaining({ symbolName: "getUser", line: 11 }),
      }),
    );
  });

  it("does not resolve an aliased receiver variable to the implementation", () => {
    const sources = {
      "service.ts": `
export interface Service {
  getUser(): void;
}

export class UserService implements Service {
  getUser() {}
}

export function consume() {
  const s: Service = new UserService();
  let s2: Service;
  s2 = s;
  s2.getUser();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("does not create edges for constructor calls with wrapped expressions", () => {
    const sources = {
      "service.ts": `
export class Service {
  constructor() {
    helper();
  }
}

export function helper() {}

export function consume() {
  new (Service)();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});
