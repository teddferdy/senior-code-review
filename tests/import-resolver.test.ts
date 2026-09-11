import { describe, expect, it } from "vitest";
import { resolveImport } from "../src/repository/import-resolver.js";

describe("Import Resolver", () => {
  it("should resolve a relative import to a repository file", () => {
    const resolved = resolveImport(
      "src/controllers/order-controller.ts",
      "../services/order-service.js",
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(resolved).toBe("src/services/order-service.ts");
  });

  it("should return undefined when the import cannot be resolved", () => {
    const resolved = resolveImport(
      "src/controllers/order-controller.ts",
      "../services/missing-service.js",
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(resolved).toBeUndefined();
  });

  it("should resolve a relative import to an index file", () => {
    const resolved = resolveImport(
      "src/controllers/order-controller.ts",
      "../services",
      ["src/controllers/order-controller.ts", "src/services/index.ts"],
    );

    expect(resolved).toBe("src/services/index.ts");
  });

  it("should resolve an extensionless import", () => {
    const resolved = resolveImport(
      "src/controllers/order-controller.ts",
      "../services/order-service",
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(resolved).toBe("src/services/order-service.ts");
  });
});
