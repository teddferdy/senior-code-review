import type { RepositoryManifest } from "./types.js";

export interface RepositoryMap {
  sourceDirectories: string[];
  testDirectories: string[];
  documentationDirectories: string[];
  configurationFiles: string[];
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
    sourceDirectories: [...sourceDirectories].sort(),
    testDirectories: [...testDirectories].sort(),
    documentationDirectories: [...documentationDirectories].sort(),
    configurationFiles,
  };
}
