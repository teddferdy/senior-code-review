import type { RepositoryManifest } from "./types.js";

export interface RepositoryMap {
  sourceRoots: string[];
  sourceDirectories: string[];
  testDirectories: string[];
  documentationDirectories: string[];
  configurationFiles: string[];
  entryPoints: string[];
}

export function buildRepositoryMap(
  manifest: RepositoryManifest,
): RepositoryMap {
  const sourceDirectories = new Set<string>();
  const testDirectories = new Set<string>();
  const documentationDirectories = new Set<string>();
  const configurationFiles = manifest.files
    .filter((file) => file.kind === "config")
    .map((file) => file.relativePath)
    .sort();
  const entryPoints = manifest.files
    .filter((file) => {
      if (file.kind !== "source") {
        return false;
      }

      const fileName = file.relativePath.split("/").pop() ?? "";
      const baseName = fileName.split(".")[0];

      return ["index", "main"].includes(baseName);
    })
    .map((file) => file.relativePath)
    .sort();

  for (const file of manifest.files) {
    if (file.kind !== "documentation") {
      continue;
    }

    const [topLevelDirectory] = file.relativePath.split("/");

    if (topLevelDirectory) {
      documentationDirectories.add(topLevelDirectory);
    }
  }

  for (const file of manifest.files) {
    if (file.kind !== "test") {
      continue;
    }

    const [topLevelDirectory] = file.relativePath.split("/");

    if (topLevelDirectory) {
      testDirectories.add(topLevelDirectory);
    }
  }

  for (const file of manifest.files) {
    if (file.kind !== "source") {
      continue;
    }

    const [topLevelDirectory] = file.relativePath.split("/");

    if (topLevelDirectory) {
      sourceDirectories.add(topLevelDirectory);
    }
  }

  return {
    sourceRoots: [...sourceDirectories].sort(),
    sourceDirectories: [...sourceDirectories].sort(),
    testDirectories: [...testDirectories].sort(),
    documentationDirectories: [...documentationDirectories].sort(),
    configurationFiles,
    entryPoints,
  };
}
