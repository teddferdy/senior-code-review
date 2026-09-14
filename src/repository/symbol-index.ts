import type { RepositorySymbol } from "./symbols.js";
import { analyzeSymbols } from "./symbol-analyzer.js";

export interface SymbolIndex {
  symbolsByFile: Record<string, RepositorySymbol[]>;
}

export function buildSymbolIndex(sources: Record<string, string>): SymbolIndex {
  const symbolsByFile: Record<string, RepositorySymbol[]> = {};

  for (const [filePath, sourceCode] of Object.entries(sources)) {
    symbolsByFile[filePath] = analyzeSymbols(sourceCode, filePath);
  }

  return {
    symbolsByFile,
  };
}
