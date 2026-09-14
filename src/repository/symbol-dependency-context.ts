import type { DependencyGraph } from "./dependency-graph.js";
import type { RepositorySymbol } from "./symbols.js";

export function getSymbolDependents(
  symbol: RepositorySymbol,
  dependencyGraph: DependencyGraph,
): string[] {
  return dependencyGraph.dependents[symbol.filePath] ?? [];
}

export function getSymbolDependencyContext(
  symbol: RepositorySymbol,
  dependencyGraph: DependencyGraph,
): {
  filePath: string;
  dependencies: string[];
  dependents: string[];
} {
  return {
    filePath: symbol.filePath,
    dependencies: [...(dependencyGraph.dependencies[symbol.filePath] ?? [])],
    dependents: [...getSymbolDependents(symbol, dependencyGraph)],
  };
}
