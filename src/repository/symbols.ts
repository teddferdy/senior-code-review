export type RepositorySymbolKind =
  | "function"
  | "class"
  | "method"
  | "variable"
  | "constant";

export interface RepositorySymbol {
  name: string;
  kind: RepositorySymbolKind;
  filePath: string;
  line: number;
  exported: boolean;
}
