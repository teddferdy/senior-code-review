import { describe, expect, it } from "vitest";
import { resolveVariableType } from "../src/repository/type-intelligence";

describe("type intelligence", () => {
  it("resolves a variable initialized with a class instance", () => {
    const sources = {
      "service.ts": `
export class UserService {}
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer() {
  const service = new UserService();
  service;
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "service.ts",
    });
  });

  it("resolves an imported class instance with an arbitrary variable name", () => {
    const sources = {
      "service.ts": `
export class PaymentService {}
`,
      "consumer.ts": `
import { PaymentService } from "./service";

export function consumer() {
  const paymentService = new PaymentService();
  paymentService;
}
`,
    };

    const result = resolveVariableType(
      sources,
      "consumer.ts",
      "paymentService",
    );

    expect(result).toEqual({
      typeName: "PaymentService",
      filePath: "service.ts",
    });
  });

  it("resolves a class instance through a cross-file import", () => {
    const sources = {
      "domain/user-service.ts": `
export class UserService {}
`,
      "app/consumer.ts": `
import { UserService } from "../domain/user-service";

export function consumer() {
  const service = new UserService();
  service;
}
`,
    };

    const result = resolveVariableType(sources, "app/consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "domain/user-service.ts",
    });
  });

  it("resolves a variable type from an explicit type annotation", () => {
    const sources = {
      "service.ts": `
export class UserService {}
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer() {
  const service: UserService = {} as UserService;
  service;
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "service.ts",
    });
  });

  it("resolves a variable type from an interface annotation", () => {
    const sources = {
      "types.ts": `
export interface UserService {
  getUser(): void;
}
`,
      "consumer.ts": `
import { UserService } from "./types";

export function consumer() {
  const service: UserService = {} as UserService;
  service;
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "types.ts",
    });
  });

  it("resolves a variable type from a subclass instance", () => {
    const sources = {
      "service.ts": `
export class BaseService {}

export class UserService extends BaseService {}
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer() {
  const service = new UserService();
  service;
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "service.ts",
    });
  });

  it("resolves an overridden method receiver to the concrete subclass", () => {
    const sources = {
      "service.ts": `
export class BaseService {
  handle(): void {}
}

export class UserService extends BaseService {
  override handle(): void {}
}
`,
      "consumer.ts": `
import { UserService } from "./service";

export function consumer() {
  const service = new UserService();
  service.handle();
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "UserService",
      filePath: "service.ts",
    });
  });

  it("resolves a polymorphic variable to its declared interface type", () => {
    const sources = {
      "service.ts": `
export interface Service {
  handle(): void;
}

export class UserService implements Service {
  handle(): void {}
}
`,
      "consumer.ts": `
import { Service } from "./service";
import { UserService } from "./service";

export function consumer() {
  const service: Service = new UserService();
  service.handle();
}
`,
    };

    const result = resolveVariableType(sources, "consumer.ts", "service");

    expect(result).toEqual({
      typeName: "Service",
      filePath: "service.ts",
    });
  });
});
