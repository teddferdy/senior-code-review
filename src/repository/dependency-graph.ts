import { buildImportMap } from "./import-map.js";
import { resolveImport } from "./import-resolver.js";

export interface DependencyGraph {
  dependencies: Record<string, string[]>;
  dependents: Record<string, string[]>;
  cycles: string[][];
}

function detectCycles(dependencies: Record<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(file: string, path: string[]): void {
    if (visiting.has(file)) {
      const cycleStart = path.indexOf(file);

      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart));
      }

      return;
    }

    if (visited.has(file)) {
      return;
    }

    visiting.add(file);

    for (const dependency of dependencies[file] ?? []) {
      visit(dependency, [...path, dependency]);
    }

    visiting.delete(file);
    visited.add(file);
  }

  for (const file of Object.keys(dependencies).sort()) {
    visit(file, [file]);
  }

  return cycles;
}

export function buildDependencyGraph(
  sources: Record<string, string>,
  repositoryFiles: string[],
): DependencyGraph {
  const importMap = buildImportMap(sources);

  const dependencies: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};

  for (const file of repositoryFiles) {
    dependencies[file] = [];
    dependents[file] = [];
  }

  for (const [sourceFile, imports] of Object.entries(importMap.imports)) {
    dependencies[sourceFile] = [
      ...new Set(
        imports
          .map((importPath) =>
            resolveImport(sourceFile, importPath, repositoryFiles),
          )
          .filter(
            (resolved): resolved is string =>
              resolved !== undefined && resolved !== sourceFile,
          ),
      ),
    ].sort();
  }

  for (const [sourceFile, dependencyFiles] of Object.entries(dependencies)) {
    for (const dependencyFile of dependencyFiles) {
      dependents[dependencyFile].push(sourceFile);
    }
  }

  for (const dependencyFile of Object.keys(dependents)) {
    dependents[dependencyFile] = [
      ...new Set(dependents[dependencyFile]),
    ].sort();
  }

  const cycles = detectCycles(dependencies);

  return {
    dependencies,
    dependents,
    cycles,
  };
}
