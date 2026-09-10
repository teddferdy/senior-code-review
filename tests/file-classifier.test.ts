import { describe, expect, it } from "vitest";
import { classifyFile } from "../src/repository/file-classifier.js";

describe("classifyFile", () => {
  it("should classify source files", () => {
    expect(classifyFile("src/index.ts", ".ts")).toBe("source");
    expect(classifyFile("src/component.tsx", ".tsx")).toBe("source");
    expect(classifyFile("src/app.js", ".js")).toBe("source");
    expect(classifyFile("src/component.jsx", ".jsx")).toBe("source");
  });

  it("should classify documentation files", () => {
    expect(classifyFile("README.md", ".md")).toBe("documentation");
    expect(classifyFile("docs/guide.mdx", ".mdx")).toBe("documentation");
  });

  it("should classify config files", () => {
    expect(classifyFile("package.json", ".json")).toBe("config");
    expect(classifyFile("config/app.yaml", ".yaml")).toBe("config");
    expect(classifyFile("config/app.yml", ".yml")).toBe("config");
  });

  it("should classify test files before source files", () => {
    expect(classifyFile("src/user.test.ts", ".ts")).toBe("test");
    expect(classifyFile("src/user.spec.tsx", ".tsx")).toBe("test");
    expect(classifyFile("src/user.test.js", ".js")).toBe("test");
    expect(classifyFile("src/user.spec.jsx", ".jsx")).toBe("test");
  });

  it("should classify unknown files", () => {
    expect(classifyFile("assets/logo.png", ".png")).toBe("unknown");
    expect(classifyFile("data/database.sql", ".sql")).toBe("unknown");
  });

  it("should not classify normal source filenames as test files", () => {
    expect(classifyFile("src/test.ts", ".ts")).toBe("source");
    expect(classifyFile("src/spec.ts", ".ts")).toBe("source");
    expect(classifyFile("src/testing.ts", ".ts")).toBe("source");
  });
});
