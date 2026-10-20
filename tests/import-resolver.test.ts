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

  it("does not resolve a CSS specifier to a same-basename source", () => {
    expect(
      resolveImport("src/consumer.ts", "./styles.css", [
        "src/consumer.ts",
        "src/styles.ts",
      ]),
    ).toBeUndefined();
  });

  it("does not resolve a JSON specifier to a same-basename source", () => {
    expect(
      resolveImport("src/consumer.ts", "./data.json", [
        "src/consumer.ts",
        "src/data.ts",
      ]),
    ).toBeUndefined();
  });

  it("does not resolve a text specifier to a same-basename source", () => {
    expect(
      resolveImport("src/consumer.ts", "./notes.txt", [
        "src/consumer.ts",
        "src/notes.ts",
      ]),
    ).toBeUndefined();
  });

  it("does not resolve an .mjs specifier to a same-basename source", () => {
    expect(
      resolveImport("src/consumer.ts", "./helper.mjs", [
        "src/consumer.ts",
        "src/helper.ts",
      ]),
    ).toBeUndefined();
  });

  it("does not resolve a .cjs specifier to a same-basename source", () => {
    expect(
      resolveImport("src/consumer.ts", "./helper.cjs", [
        "src/consumer.ts",
        "src/helper.ts",
      ]),
    ).toBeUndefined();
  });

  it("keeps an exact non-source match ahead of source substitution", () => {
    expect(
      resolveImport("src/consumer.ts", "./styles.css", [
        "src/consumer.ts",
        "src/styles.ts",
        "src/styles.css",
      ]),
    ).toBe("src/styles.css");
  });

  it("resolves a .js specifier to a .tsx source when no exact file exists", () => {
    expect(
      resolveImport("src/consumer.ts", "./view.js", [
        "src/consumer.ts",
        "src/view.tsx",
      ]),
    ).toBe("src/view.tsx");
  });

  it("resolves a .jsx specifier to a .tsx source when no exact file exists", () => {
    expect(
      resolveImport("src/consumer.ts", "./view.jsx", [
        "src/consumer.ts",
        "src/view.tsx",
      ]),
    ).toBe("src/view.tsx");
  });

  it("keeps an exact .js match ahead of TypeScript substitution", () => {
    expect(
      resolveImport("src/consumer.ts", "./service.js", [
        "src/consumer.ts",
        "src/service.ts",
        "src/service.js",
      ]),
    ).toBe("src/service.js");
  });

  it("keeps an explicit .ts import on the exact declared file", () => {
    expect(
      resolveImport("src/consumer.ts", "./service.ts", [
        "src/consumer.ts",
        "src/service.tsx",
        "src/service.ts",
      ]),
    ).toBe("src/service.ts");
  });

  it("does not substitute a different source extension for an explicit .ts import", () => {
    expect(
      resolveImport("src/consumer.ts", "./service.ts", [
        "src/consumer.ts",
        "src/service.tsx",
      ]),
    ).toBeUndefined();
  });

  it("prefers TypeScript source over a same-basename script for extensionless imports", () => {
    expect(
      resolveImport("src/consumer.ts", "./foo", [
        "src/consumer.ts",
        "src/foo.js",
        "src/foo.ts",
      ]),
    ).toBe("src/foo.ts");
  });

  it("prefers a same-basename file over a directory index", () => {
    expect(
      resolveImport("src/consumer.ts", "./services", [
        "src/consumer.ts",
        "src/services/index.ts",
        "src/services.ts",
      ]),
    ).toBe("src/services.ts");
  });

  it("does not resolve an extensionless asset-only sibling", () => {
    expect(
      resolveImport("src/consumer.ts", "./styles", [
        "src/consumer.ts",
        "src/styles.css",
      ]),
    ).toBeUndefined();
  });

  it("keeps an explicit .tsx import on the exact declared file", () => {
    expect(
      resolveImport("src/consumer.ts", "./component.tsx", [
        "src/consumer.ts",
        "src/component.tsx",
      ]),
    ).toBe("src/component.tsx");
  });

  it("uses the generic source-extension order for .jsx substitution", () => {
    expect(
      resolveImport("src/consumer.ts", "./foo.jsx", [
        "src/consumer.ts",
        "src/foo.tsx",
        "src/foo.ts",
      ]),
    ).toBe("src/foo.ts");
  });

  it("does not resolve an unsupported explicit extension through a directory index", () => {
    expect(
      resolveImport("src/consumer.ts", "./styles.css", [
        "src/consumer.ts",
        "src/styles.css/index.ts",
      ]),
    ).toBeUndefined();
  });

  it("keeps an exact unsupported file ahead of a directory index", () => {
    expect(
      resolveImport("src/consumer.ts", "./styles.css", [
        "src/consumer.ts",
        "src/styles.css/index.ts",
        "src/styles.css",
      ]),
    ).toBe("src/styles.css");
  });

  it("returns the same resolution across repeated calls", () => {
    const files = ["src/consumer.ts", "src/foo.js", "src/foo.ts"];

    expect(resolveImport("src/consumer.ts", "./foo", files)).toBe(
      "src/foo.ts",
    );
    expect(resolveImport("src/consumer.ts", "./foo", files)).toBe(
      "src/foo.ts",
    );
  });
});
