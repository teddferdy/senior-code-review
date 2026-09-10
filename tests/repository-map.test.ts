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

    expect(map).toEqual({
      sourceDirectories: ["src"],
      testDirectories: ["tests"],
      documentationDirectories: ["docs"],
      configurationFiles: ["package.json"],
    });
  });
});
