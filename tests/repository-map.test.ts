import { describe, expect, it } from "vitest";

import { buildRepositoryMap } from "../src/repository/repository-map.js";
import type { RepositoryManifest } from "../src/repository/types.js";

describe("buildRepositoryMap", () => {
  it("should build a repository map", () => {
    const manifest: RepositoryManifest = {
      repositoryRoot: "/tmp/project",
      topLevelDirectories: ["docs", "src", "tests"],
      files: [
        {
          relativePath: "src/app.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "tests/app.test.ts",
          extension: ".ts",
          kind: "test",
        },
        {
          relativePath: "docs/guide.md",
          extension: ".md",
          kind: "documentation",
        },
        {
          relativePath: "package.json",
          extension: ".json",
          kind: "config",
        },
      ],
      statistics: {
        totalFiles: 4,
        languages: {
          typescript: 2,
        },
      },
      packageManagers: ["npm"],
    };

    const map = buildRepositoryMap(manifest);

    expect(map.sourceRoots).toEqual(["src"]);

    expect(map).toEqual({
      sourceRoots: ["src"],
      sourceDirectories: ["src"],
      testDirectories: ["tests"],
      documentationDirectories: ["docs"],
      configurationFiles: ["package.json"],
      entryPoints: [],
    });
  });

  it("should detect multiple source roots", () => {
    const manifest: RepositoryManifest = {
      repositoryRoot: "/tmp/project",
      topLevelDirectories: ["lib", "src", "tests"],
      files: [
        {
          relativePath: "src/app.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "lib/helper.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "tests/app.test.ts",
          extension: ".ts",
          kind: "test",
        },
      ],
      statistics: {
        totalFiles: 3,
        languages: {
          typescript: 3,
        },
      },
      packageManagers: ["npm"],
    };

    const map = buildRepositoryMap(manifest);

    expect(map.sourceRoots).toEqual(["lib", "src"]);
  });

  it("should treat nested source files as one source root", () => {
    const manifest: RepositoryManifest = {
      repositoryRoot: "/tmp/project",
      topLevelDirectories: ["src"],
      files: [
        {
          relativePath: "src/app.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "src/features/order.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "src/components/Button.tsx",
          extension: ".tsx",
          kind: "source",
        },
      ],
      statistics: {
        totalFiles: 3,
        languages: {
          typescript: 3,
        },
      },
      packageManagers: ["npm"],
    };

    const map = buildRepositoryMap(manifest);

    expect(map.sourceRoots).toEqual(["src"]);
  });

  it("should detect source entry points", () => {
    const manifest: RepositoryManifest = {
      repositoryRoot: "/tmp/project",
      topLevelDirectories: ["src"],
      files: [
        {
          relativePath: "src/main.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "src/index.ts",
          extension: ".ts",
          kind: "source",
        },
        {
          relativePath: "src/components/Button.tsx",
          extension: ".tsx",
          kind: "source",
        },
      ],
      statistics: {
        totalFiles: 3,
        languages: {
          typescript: 3,
        },
      },
      packageManagers: ["npm"],
    };

    const map = buildRepositoryMap(manifest);

    expect(map.entryPoints).toEqual(["src/index.ts", "src/main.ts"]);
  });
});
