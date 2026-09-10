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

export function detectRepositoryPackageManagers(
  rootFiles: string[],
): PackageManager[] {
  const files = new Set(rootFiles);

  if (files.has("pnpm-lock.yaml")) {
    return ["pnpm"];
  }

  if (files.has("yarn.lock")) {
    return ["yarn"];
  }

  if (files.has("bun.lock")) {
    return ["bun"];
  }

  if (files.has("package.json")) {
    return ["npm"];
  }

  if (files.has("Cargo.toml")) {
    return ["cargo"];
  }

  if (files.has("go.mod")) {
    return ["go"];
  }

  if (files.has("requirements.txt")) {
    return ["pip"];
  }

  if (files.has("pyproject.toml")) {
    return ["python"];
  }

  return [];
}
