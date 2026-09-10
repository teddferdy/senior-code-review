export type RepositoryLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "java"
  | "go"
  | "rust"
  | "php"
  | "unknown";

const LANGUAGE_BY_EXTENSION: Record<string, RepositoryLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".php": "php",
};

export function detectLanguage(extension: string): RepositoryLanguage {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? "unknown";
}
