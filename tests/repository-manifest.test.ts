import { describe, expect, it } from "vitest";
import { RepositoryScanner } from "../src/repository/scanner.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("RepositoryManifest", () => {
  it("should include language statistics and detected package managers", () => {
    const scanner = new RepositoryScanner();

    const manifest = scanner.scan(process.cwd());

    expect(manifest.statistics.languages).toBeDefined();
    expect(manifest.packageManagers).toBeDefined();
  });

  it("should aggregate languages and detect the repository package manager", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "senior-code-reviewer-"));

    mkdirSync(join(repositoryRoot, "src"));
    mkdirSync(join(repositoryRoot, "tests"));

    writeFileSync(join(repositoryRoot, "package.json"), JSON.stringify({}));

    writeFileSync(
      join(repositoryRoot, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'",
    );

    writeFileSync(
      join(repositoryRoot, "src", "app.ts"),
      "export const app = true;",
    );

    writeFileSync(
      join(repositoryRoot, "src", "component.tsx"),
      "export function Component() {}",
    );

    writeFileSync(
      join(repositoryRoot, "src", "helper.js"),
      "module.exports = {};",
    );

    writeFileSync(
      join(repositoryRoot, "tests", "app.test.ts"),
      "test('app', () => {});",
    );

    const scanner = new RepositoryScanner();
    const manifest = scanner.scan(repositoryRoot);

    expect(manifest.statistics.totalFiles).toBe(6);

    expect(manifest.statistics.languages).toEqual({
      javascript: 1,
      typescript: 3,
    });

    expect(manifest.packageManagers).toEqual(["pnpm"]);
  });
});
