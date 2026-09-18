import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("type-aware call graph", () => {
  it("resolves a method call through a typed class instance", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer() {
  const service = new UserService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
        }),
      }),
    );
  });

  it("resolves a method call through a cross-file class instance", () => {
    const sources = {
      "domain/user-service.ts": `
export class UserService {
  getUser() {}
}
`,
      "app/consumer.ts": `
import { UserService } from "../domain/user-service";

export function consumer() {
  const service = new UserService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "domain/user-service.ts",
        }),
      }),
    );
  });

  it("resolves a method call through an interface-typed receiver", () => {
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

export function consumer() {
  const service: Service = new UserService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
        }),
      }),
    );
  });

  it("resolves an inherited method through a subclass instance", () => {
    const sources = {
      "service.ts": `
export class UserService {
  getUser() {}
}

export class AdminService extends UserService {}
`,
      "consumer.ts": `
import { AdminService } from "./service";

export function consumer() {
  const service = new AdminService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
        }),
      }),
    );
  });

  it("resolves an inherited method across files", () => {
    const sources = {
      "domain/user-service.ts": `
export class UserService {
  getUser() {}
}
`,
      "domain/admin-service.ts": `
import { UserService } from "./user-service";

export class AdminService extends UserService {}
`,
      "app/consumer.ts": `
import { AdminService } from "../domain/admin-service";

export function consumer() {
  const service = new AdminService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "domain/user-service.ts",
        }),
      }),
    );
  });

  it("resolves an overridden method on the subclass instead of the parent", () => {
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
import { AdminService } from "./service";

export function consumer() {
  const service = new AdminService();
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 7,
        }),
      }),
    );

    expect(result.edges).not.toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 3,
        }),
      }),
    );
  });

  it("resolves polymorphic dispatch to all compatible implementations", () => {
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
  service.getUser();
}

export function run() {
  consumer(new UserService());
  consumer(new AdminService());
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 3,
        }),
      }),
    );

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 7,
        }),
      }),
    );
  });

  it("resolves polymorphic dispatch across files", () => {
    const sources = {
      "domain/user-service.ts": `
export class UserService {
  getUser() {}
}
`,
      "domain/admin-service.ts": `
import { UserService } from "./user-service";

export class AdminService extends UserService {
  getUser() {}
}
`,
      "app/consumer.ts": `
import { UserService } from "../domain/user-service";
import { AdminService } from "../domain/admin-service";

export function consumer(service: UserService) {
  service.getUser();
}

export function run() {
  consumer(new UserService());
  consumer(new AdminService());
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "domain/user-service.ts",
          line: 3,
        }),
      }),
    );

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "domain/admin-service.ts",
          line: 5,
        }),
      }),
    );
  });

  it("does not include unrelated same-name methods in polymorphic dispatch", () => {
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
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer(service: UserService) {
  service.getUser();
}
`,
    };

    const result = buildCallGraph(sources);

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 3,
        }),
      }),
    );

    expect(result.edges).toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 7,
        }),
      }),
    );

    expect(result.edges).not.toContainEqual(
      expect.objectContaining({
        caller: expect.objectContaining({
          symbolName: "consumer",
        }),
        callee: expect.objectContaining({
          symbolName: "getUser",
          filePath: "service.ts",
          line: 11,
        }),
      }),
    );
  });
});
