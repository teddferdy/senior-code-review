import { describe, expect, it } from "vitest";

import {
  detectPackageManager,
  detectRepositoryPackageManagers,
} from "../src/repository/package-manager-detector.js";

describe("detectPackageManager", () => {
  it("should detect npm", () => {
    expect(detectPackageManager("package.json")).toBe("npm");
  });

  it("should detect yarn", () => {
    expect(detectPackageManager("yarn.lock")).toBe("yarn");
  });

  it("should detect pnpm", () => {
    expect(detectPackageManager("pnpm-lock.yaml")).toBe("pnpm");
  });

  it("should detect bun", () => {
    expect(detectPackageManager("bun.lock")).toBe("bun");
  });

  it("should detect cargo", () => {
    expect(detectPackageManager("Cargo.toml")).toBe("cargo");
  });

  it("should detect go", () => {
    expect(detectPackageManager("go.mod")).toBe("go");
  });

  it("should detect pip", () => {
    expect(detectPackageManager("requirements.txt")).toBe("pip");
  });

  it("should detect python project", () => {
    expect(detectPackageManager("pyproject.toml")).toBe("python");
  });

  it("should return unknown for unsupported files", () => {
    expect(detectPackageManager("README.md")).toBe("unknown");
    expect(detectPackageManager("package-lock.json")).toBe("unknown");
  });

  it("should detect repository package manager with lockfile precedence", () => {
    expect(
      detectRepositoryPackageManagers(["package.json", "pnpm-lock.yaml"]),
    ).toEqual(["pnpm"]);

    expect(
      detectRepositoryPackageManagers(["package.json", "yarn.lock"]),
    ).toEqual(["yarn"]);

    expect(detectRepositoryPackageManagers(["package.json"])).toEqual(["npm"]);
  });

  it("should return no package manager when none is detected", () => {
    expect(
      detectRepositoryPackageManagers(["README.md", "src/index.ts"]),
    ).toEqual([]);
  });

  it("should prefer pnpm over npm when both package.json and pnpm lockfile exist", () => {
    expect(
      detectRepositoryPackageManagers(["package.json", "pnpm-lock.yaml"]),
    ).toEqual(["pnpm"]);
  });
});
