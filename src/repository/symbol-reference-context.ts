import { findSymbolReferences } from "./symbol-reference.js";
import { findSymbolCallContexts } from "./symbol-call-context.js";

export interface SymbolReferenceContext {
  references: Array<{
    symbolName: string;
    filePath: string;
    line: number;
  }>;
  calls: Array<{
    symbolName: string;
    filePath: string;
    line: number;
  }>;
}

export function findSymbolReferenceContext(
  sourceCode: string,
  filePath: string,
  symbolName: string,
): SymbolReferenceContext {
  return {
    references: findSymbolReferences(sourceCode, filePath, symbolName),
    calls: findSymbolCallContexts(sourceCode, filePath, symbolName),
  };
}
