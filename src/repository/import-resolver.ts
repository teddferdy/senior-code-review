import { dirname, normalize, posix } from "node:path";

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

  const withoutExtension = candidate.replace(/\.[^.]+$/, "");

  const indexCandidates = [
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
    `${candidate}/index.js`,
    `${candidate}/index.jsx`,
  ];

  return repositoryFiles.find((file) => {
    const fileWithoutExtension = file.replace(/\.[^.]+$/, "");

    return (
      file === candidate ||
      fileWithoutExtension === withoutExtension ||
      indexCandidates.includes(file)
    );
  });
}
