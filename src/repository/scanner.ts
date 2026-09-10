import { readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import type { RepositoryFile, RepositoryManifest } from "./types.js";
import { classifyFile } from "./file-classifier.js";
import { detectLanguage } from "./language-detector.js";
import { detectRepositoryPackageManagers } from "./package-manager-detector.js";

const IGNORED_DIRECTORIES = new Set([
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
]);

export class RepositoryScanner {
  scan(repositoryRoot: string): RepositoryManifest {
    const root = resolve(repositoryRoot);
    const files: RepositoryFile[] = [];
    const topLevelDirectories = new Set<string>();
    const languages: Record<string, number> = {};

    this.walk(root, root, files, topLevelDirectories);

    const rootFiles = files
      .filter((file) => !file.relativePath.includes("/"))
      .map((file) => file.relativePath);

    const packageManagers = detectRepositoryPackageManagers(rootFiles);

    for (const file of files) {
      const language = detectLanguage(file.extension);

      if (language === "unknown") {
        continue;
      }

      languages[language] = (languages[language] ?? 0) + 1;
    }

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return {
      repositoryRoot: root,
      files,
      topLevelDirectories: [...topLevelDirectories].sort(),
      statistics: {
        totalFiles: files.length,
        languages,
      },
      packageManagers,
    };
  }

  private walk(
    root: string,
    currentPath: string,
    files: RepositoryFile[],
    topLevelDirectories: Set<string>,
  ): void {
    const entries = readdirSync(currentPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = resolve(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const relativeDirectory = relative(root, fullPath);

        if (!relativeDirectory.includes("/")) {
          topLevelDirectories.add(entry.name);
        }

        this.walk(root, fullPath, files, topLevelDirectories);

        continue;
      }

      const relativePath = relative(root, fullPath);

      files.push({
        relativePath,
        extension: extname(entry.name),
        kind: classifyFile(relativePath, extname(entry.name)),
      });
    }
  }
}
