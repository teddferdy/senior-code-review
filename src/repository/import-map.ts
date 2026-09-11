export interface ImportMap {
  imports: Record<string, string[]>;
}

export function buildImportMap(sources: Record<string, string>): ImportMap {
  const imports: Record<string, string[]> = {};

  for (const [filePath, sourceCode] of Object.entries(sources)) {
    const matches = sourceCode.matchAll(
      /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    );

    imports[filePath] = [...matches].map((match) => match[1]);
  }

  return {
    imports,
  };
}
