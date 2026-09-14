import type { RepositorySymbol } from "./symbols.js";
import type { SymbolIndex } from "./symbol-index.js";

export function findSymbol(
  index: SymbolIndex,
  filePath: string,
  symbolName: string,
): RepositorySymbol | undefined {
  return index.symbolsByFile[filePath]?.find(
    (symbol) => symbol.name === symbolName,
  );
}

export function findSymbolsByName(
  index: SymbolIndex,
  symbolName: string,
): RepositorySymbol[] {
  return Object.values(index.symbolsByFile)
    .flat()
    .filter((symbol) => symbol.name === symbolName);
}

export function findExportedSymbolsByName(
  index: SymbolIndex,
  symbolName: string,
): RepositorySymbol[] {
  return Object.values(index.symbolsByFile)
    .flat()
    .filter((symbol) => symbol.name === symbolName && symbol.exported);
}
