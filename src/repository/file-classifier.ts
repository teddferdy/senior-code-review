import type { RepositoryFileKind } from "./types.js";

export function classifyFile(
  relativePath: string,
  extension: string,
): RepositoryFileKind {
  const fileName = relativePath.split("/").pop() ?? "";

  if (fileName.includes(".test.") || fileName.includes(".spec.")) {
    return "test";
  }

  if ([".ts", ".tsx", ".js", ".jsx"].includes(extension)) {
    return "source";
  }

  if ([".md", ".mdx"].includes(extension)) {
    return "documentation";
  }

  if ([".json", ".yaml", ".yml"].includes(extension)) {
    return "config";
  }

  return "unknown";
}
