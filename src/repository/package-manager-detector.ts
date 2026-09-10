export type PackageManager =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "cargo"
  | "go"
  | "pip"
  | "python"
  | "unknown";

const PACKAGE_MANAGER_BY_FILE: Record<string, PackageManager> = {
  "package.json": "npm",
  "yarn.lock": "yarn",
  "pnpm-lock.yaml": "pnpm",
  "bun.lock": "bun",
  "Cargo.toml": "cargo",
  "go.mod": "go",
  "requirements.txt": "pip",
  "pyproject.toml": "python",
};

export function detectPackageManager(fileName: string): PackageManager {
  return PACKAGE_MANAGER_BY_FILE[fileName] ?? "unknown";
}
