import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

import { normalizeCanonicalPath } from "../repository/declaration-ids.js";

/*
 * V1 deterministic filesystem source loader — K21 §G/§Q exact spec lock.
 *
 * Bridges a real repository directory to the in-memory
 * `Record<string, string>` sources record consumed by AnalysisContext.
 * Never modifies the repository; never creates implicit output files.
 *
 * Determinism rules (locked):
 * - directory entries are sorted with ordinary UTF-16 code-unit `<`
 *   ordering at every level — never locale-dependent comparison
 *   (deliberately not reusing `scanner.ts` ordering, which relies on
 *   a locale-sensitive comparator).
 * - symlinks (file or directory) are skipped, never followed.
 * - only `.ts` / `.tsx` / `.js` / `.jsx` (case-insensitive, matching
 *   `isSupportedProgramPath`) are read, as UTF-8.
 * - canonical paths use POSIX separators and the locked V1
 *   normalization; collected keys are emitted in sorted order.
 *
 * Ignore behavior (minimal, documented — not a policy framework): the
 * directory-name list below is the same conservative set already used
 * by `RepositoryScanner` for skipping tooling/dependency/output
 * directories. Hidden directories other than the listed ones are
 * traversed exactly like ordinary directories.
 */

export const V1_LOADER_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
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

const V1_SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
]);

function compareStrings(left: string, right: string): number {
  if (left !== right) {
    return left < right ? -1 : 1;
  }

  return 0;
}

export interface V1LoadedSources {
  readonly repositoryRoot: string;
  readonly files: readonly string[];
  readonly sources: Readonly<Record<string, string>>;
}

function collectFiles(
  root: string,
  currentRelativeDir: string,
  out: { canonicalPath: string; absolutePath: string }[],
): void {
  const currentAbsoluteDir =
    currentRelativeDir === "" ? root : join(root, currentRelativeDir);

  let names: import("node:fs").Dirent<string>[];

  try {
    names = readdirSync(currentAbsoluteDir, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `V1 review cannot read directory "${currentAbsoluteDir}": ${messageOf(error)}`,
    );
  }

  names.sort((left, right) => compareStrings(left.name, right.name));

  for (const entry of names) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (V1_LOADER_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const childRelative =
        currentRelativeDir === ""
          ? entry.name
          : `${currentRelativeDir}/${entry.name}`;

      collectFiles(root, childRelative, out);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!V1_SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    const absolutePath = join(currentAbsoluteDir, entry.name);
    const rawRelative = relative(root, absolutePath).split(sep).join("/");
    const canonical = normalizeCanonicalPath(rawRelative);

    if (canonical === undefined) {
      continue;
    }

    out.push({ canonicalPath: canonical, absolutePath });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadV1Sources(repositoryRoot: string): V1LoadedSources {
  if (typeof repositoryRoot !== "string" || repositoryRoot === "") {
    throw new Error("V1 review requires a non-empty repositoryRoot.");
  }

  const root = resolve(repositoryRoot);

  let stat: import("node:fs").Stats;

  try {
    stat = statSync(root);
  } catch {
    throw new Error(`V1 review target does not exist: ${root}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`V1 review target is not a directory: ${root}`);
  }

  const collected: { canonicalPath: string; absolutePath: string }[] = [];

  collectFiles(root, "", collected);

  collected.sort((left, right) =>
    compareStrings(left.canonicalPath, right.canonicalPath),
  );

  const sources: Record<string, string> = {};
  const files: string[] = [];

  for (const item of collected) {
    let text: string;

    try {
      text = readFileSync(item.absolutePath, "utf8");
    } catch (error) {
      throw new Error(
        `V1 review cannot read file "${item.absolutePath}": ${messageOf(error)}`,
      );
    }

    sources[item.canonicalPath] = text;
    files.push(item.canonicalPath);
  }

  return { repositoryRoot: root, files, sources };
}
