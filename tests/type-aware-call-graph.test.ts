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
});
