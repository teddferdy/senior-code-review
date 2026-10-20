import { dirname, normalize, posix } from "node:path";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx"]);

/*
 * Exact matches win. Extensionless imports try source files in
 * .ts, .tsx, .js, .jsx order, then matching directory indexes in the
 * same order. `.js` and `.jsx` imports may substitute a same-basename
 * source file in that order. All other explicit extensions require an
 * exact match.
 */
function buildCandidates(candidate: string): string[] {
  const candidates = [candidate];
  const extension = posix.extname(candidate);
  const normalizedExtension = extension.toLowerCase();

  if (extension === "") {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${candidate}${sourceExtension}`);
    }

    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${candidate}/index${sourceExtension}`);
    }
  } else if (JAVASCRIPT_EXTENSIONS.has(normalizedExtension)) {
    const stem = candidate.slice(0, -extension.length);

    for (const sourceExtension of SOURCE_EXTENSIONS) {
      const replacement = `${stem}${sourceExtension}`;

      if (replacement !== candidate) {
        candidates.push(replacement);
      }
    }
  }

  return candidates;
}

export function resolveImport(
  sourceFile: string,
  importPath: string,
  repositoryFiles: string[],
): string | undefined {
  if (!importPath.startsWith(".")) {
    return undefined;
  }

  const sourceDirectory = dirname(sourceFile);
  const candidate = normalize(posix.join(sourceDirectory, importPath));
  const files = new Set(repositoryFiles);

  return buildCandidates(candidate).find((file) => files.has(file));
}
