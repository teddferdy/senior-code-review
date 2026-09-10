import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { RepositoryScanner } from "../src/repository/scanner.js";

describe("RepositoryScanner", () => {
  it("should scan a repository and return a manifest", () => {
    const scanner = new RepositoryScanner();

    expect(() => scanner.scan(process.cwd())).not.toThrow();
  });

  it("should ignore generated and dependency directories", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    mkdirSync(join(repositoryRoot, "src"));
    mkdirSync(join(repositoryRoot, "node_modules"));
    mkdirSync(join(repositoryRoot, "dist"));
    mkdirSync(join(repositoryRoot, ".git"));

    writeFileSync(
      join(repositoryRoot, "src", "index.ts"),
      'console.log("source");',
    );

    writeFileSync(
      join(repositoryRoot, "node_modules", "dependency.js"),
      'console.log("dependency");',
    );

    writeFileSync(
      join(repositoryRoot, "dist", "index.js"),
      'console.log("build");',
    );

    writeFileSync(join(repositoryRoot, ".git", "config"), "git config");

    const scanner = new RepositoryScanner();
    const manifest = scanner.scan(repositoryRoot);

    expect(manifest.files).toEqual([
      {
        relativePath: "src/index.ts",
        extension: ".ts",
        kind: "source",
      },
    ]);
  });

  it("should ignore all configured directories", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    const ignoredDirectories = [
      ".git",
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".next",
      ".turbo",
      ".cache",
      "target",
      "vendor",
    ];

    mkdirSync(join(repositoryRoot, "src"));

    writeFileSync(
      join(repositoryRoot, "src", "index.ts"),
      'console.log("source");',
    );

    for (const directory of ignoredDirectories) {
      mkdirSync(join(repositoryRoot, directory));

      writeFileSync(
        join(repositoryRoot, directory, "ignored.ts"),
        'console.log("ignored");',
      );
    }

    const scanner = new RepositoryScanner();
    const manifest = scanner.scan(repositoryRoot);

    expect(manifest.files).toEqual([
      {
        relativePath: "src/index.ts",
        extension: ".ts",
        kind: "source",
      },
    ]);
  });

  it("should throw when repository path does not exist", () => {
    const scanner = new RepositoryScanner();

    expect(() =>
      scanner.scan(join(tmpdir(), "senior-code-reviewer-does-not-exist")),
    ).toThrow();
  });

  it("should throw when repository path is a file", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    const filePath = join(repositoryRoot, "README.md");

    writeFileSync(filePath, "# test");

    const scanner = new RepositoryScanner();

    expect(() => scanner.scan(filePath)).toThrow();
  });

  it("should return an absolute repository root", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    const scanner = new RepositoryScanner();
    const manifest = scanner.scan(repositoryRoot);

    expect(manifest.repositoryRoot).toBe(repositoryRoot);
  });

  it("should classify source files", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    mkdirSync(join(repositoryRoot, "src"));

    writeFileSync(
      join(repositoryRoot, "src", "index.ts"),
      'console.log("source");',
    );

    writeFileSync(
      join(repositoryRoot, "src", "component.tsx"),
      "export function Component() {}",
    );

    writeFileSync(join(repositoryRoot, "src", "app.js"), 'console.log("app");');

    writeFileSync(
      join(repositoryRoot, "src", "component.jsx"),
      "export function Component() {}",
    );

    const scanner = new RepositoryScanner();
    const manifest = scanner.scan(repositoryRoot);

    expect(manifest.files).toEqual([
      {
        relativePath: "src/app.js",
        extension: ".js",
        kind: "source",
      },
      {
        relativePath: "src/component.jsx",
        extension: ".jsx",
        kind: "source",
      },
      {
        relativePath: "src/component.tsx",
        extension: ".tsx",
        kind: "source",
      },
      {
        relativePath: "src/index.ts",
        extension: ".ts",
        kind: "source",
      },
    ]);
  });
});
