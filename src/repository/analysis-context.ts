import ts from "typescript";
import { resolve } from "node:path";

import type { CallGraphNode } from "./call-graph.js";
import type {
  AliasRecord,
  CanonicalPath,
  DeclarationId,
  DeclarationRecord,
  SymbolId,
  SymbolRecord,
} from "./declaration-ids.js";
import {
  buildDeclarationTables,
  findBestDeclarationMatch,
  isSupportedProgramPath,
  normalizeCanonicalPath,
} from "./declaration-ids.js";
import type { ModuleEdge } from "./module-edges.js";
import { extractModuleEdges } from "./module-edges.js";

/*
 * Source-backed Analysis Context V1 — integration layer.
 *
 * Owns exactly one ts.Program + TypeChecker per instance, canonical
 * sources, declaration/symbol tables, and module edges. Consumes
 * already-loaded sources; performs no filesystem reads, no tsconfig
 * discovery, no caching, no cross-context sharing.
 */

export const ANALYSIS_VIRTUAL_ROOT = "/__senior_code_reviewer__";

export const ANALYSIS_COMPILER_OPTIONS: Readonly<ts.CompilerOptions> =
  Object.freeze({
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    strict: true,
  });

export interface AnalysisContextInit {
  repositoryRoot: string;
  sources: Record<string, string>;
  include?: RegExp | ((canonicalPath: string) => boolean);
}

export function toAnalysisVirtualPath(canonicalPath: CanonicalPath): string {
  const normalized = canonicalPath.replace(/\\/g, "/");

  return `${ANALYSIS_VIRTUAL_ROOT}/${normalized}`.replace(/\/+/g, "/");
}

export function fromAnalysisVirtualPath(virtualPath: string): string {
  const normalized = virtualPath.replace(/\\/g, "/");

  if (normalized.startsWith(`${ANALYSIS_VIRTUAL_ROOT}/`)) {
    return normalized.slice(ANALYSIS_VIRTUAL_ROOT.length + 1);
  }

  return normalized;
}

function matchesInclude(
  include: RegExp | ((canonicalPath: string) => boolean) | undefined,
  canonicalPath: CanonicalPath,
): boolean {
  if (include === undefined) {
    return true;
  }

  if (include instanceof RegExp) {
    // Reset lastIndex for global regexes so repeated tests are stable.
    include.lastIndex = 0;
    return include.test(canonicalPath);
  }

  return include(canonicalPath);
}

export class AnalysisContext {
  private disposed = false;

  private readonly repositoryRootAbsolute: string;

  private readonly canonicalSources: Map<CanonicalPath, string>;

  private readonly sortedCanonicalPaths: CanonicalPath[];

  private readonly lockedCompilerOptions: ts.CompilerOptions;

  private ownedProgram: ts.Program | undefined;

  private ownedChecker: ts.TypeChecker | undefined;

  private readonly tableDeclarations: Map<DeclarationId, DeclarationRecord>;

  private readonly tableSymbols: Map<SymbolId, SymbolRecord>;

  private readonly tableAliases: readonly AliasRecord[];

  private readonly tableByFile: Map<CanonicalPath, readonly DeclarationId[]>;

  private readonly tableModuleEdges: readonly ModuleEdge[];

  private readonly moduleEdgesByFrom: Map<CanonicalPath, readonly ModuleEdge[]>;

  constructor(init: AnalysisContextInit) {
    if (
      !init ||
      typeof init.repositoryRoot !== "string" ||
      init.repositoryRoot === ""
    ) {
      throw new Error("AnalysisContext requires a non-empty repositoryRoot.");
    }

    if (!init.sources || typeof init.sources !== "object") {
      throw new Error("AnalysisContext requires a sources record.");
    }

    this.repositoryRootAbsolute = resolve(init.repositoryRoot);

    const staged = new Map<CanonicalPath, string>();
    const rawKeys = Object.keys(init.sources).sort();

    for (const rawKey of rawKeys) {
      const value = init.sources[rawKey];

      if (typeof value !== "string") {
        throw new TypeError(
          `AnalysisContext source for "${rawKey}" must be a string.`,
        );
      }

      const canonical = normalizeCanonicalPath(rawKey);

      if (canonical === undefined) {
        continue;
      }

      if (!matchesInclude(init.include, canonical)) {
        continue;
      }

      staged.set(canonical, value);
    }

    this.canonicalSources = staged;
    this.sortedCanonicalPaths = [...staged.keys()].sort();
    this.lockedCompilerOptions = { ...ANALYSIS_COMPILER_OPTIONS };

    const virtualSources = new Map<string, string>();

    for (const canonicalPath of this.sortedCanonicalPaths) {
      if (!isSupportedProgramPath(canonicalPath)) {
        continue;
      }

      const text = staged.get(canonicalPath);

      if (text !== undefined) {
        virtualSources.set(toAnalysisVirtualPath(canonicalPath), text);
      }
    }

    const compilerOptions: ts.CompilerOptions = {
      ...this.lockedCompilerOptions,
    };
    const baseHost = ts.createCompilerHost(compilerOptions);
    const host = ts.createCompilerHost(compilerOptions);

    host.getSourceFile = (
      requestedFileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) => {
      const normalized = requestedFileName.replace(/\\/g, "/");
      const sourceCode = virtualSources.get(normalized);

      if (sourceCode !== undefined) {
        return ts.createSourceFile(
          requestedFileName,
          sourceCode,
          languageVersion,
          true,
        );
      }

      return baseHost.getSourceFile(
        requestedFileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    };

    host.fileExists = (requestedFileName) => {
      const normalized = requestedFileName.replace(/\\/g, "/");

      if (virtualSources.has(normalized)) {
        return true;
      }

      return ts.sys.fileExists(requestedFileName);
    };

    host.directoryExists = (directoryName) => {
      const normalized =
        directoryName.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
      const prefix = normalized === "/" ? "/" : `${normalized}/`;

      for (const virtualPath of virtualSources.keys()) {
        if (virtualPath === normalized || virtualPath.startsWith(prefix)) {
          return true;
        }
      }

      return ts.sys.directoryExists(directoryName);
    };

    host.readFile = (requestedFileName) => {
      const normalized = requestedFileName.replace(/\\/g, "/");
      const sourceCode = virtualSources.get(normalized);

      if (sourceCode !== undefined) {
        return sourceCode;
      }

      return ts.sys.readFile(requestedFileName);
    };

    const program = ts.createProgram(
      [...virtualSources.keys()],
      compilerOptions,
      host,
    );
    const checker = program.getTypeChecker();

    this.ownedProgram = program;
    this.ownedChecker = checker;

    const tableEntries: {
      canonicalPath: CanonicalPath;
      sourceFile: ts.SourceFile;
    }[] = [];

    for (const canonicalPath of this.sortedCanonicalPaths) {
      if (!isSupportedProgramPath(canonicalPath)) {
        continue;
      }

      const sourceFile = program.getSourceFile(
        toAnalysisVirtualPath(canonicalPath),
      );

      if (sourceFile) {
        tableEntries.push({ canonicalPath, sourceFile });
      }
    }

    const tables = buildDeclarationTables(checker, tableEntries);

    this.tableDeclarations = new Map(tables.declarations);
    this.tableSymbols = new Map(tables.symbols);
    this.tableAliases = [...tables.aliases];
    this.tableByFile = new Map(tables.byFile);

    const moduleEdges = extractModuleEdges({
      entries: tableEntries,
      allCanonicalPaths: this.sortedCanonicalPaths,
    });

    this.tableModuleEdges = [...moduleEdges];

    const edgesByFrom = new Map<CanonicalPath, ModuleEdge[]>();

    for (const edge of moduleEdges) {
      const existing = edgesByFrom.get(edge.from);

      if (existing) {
        existing.push(edge);
      } else {
        edgesByFrom.set(edge.from, [edge]);
      }
    }

    this.moduleEdgesByFrom = new Map(
      [...edgesByFrom.entries()].map(([file, list]) => [file, [...list]]),
    );
  }

  private assertUsable(method: string): void {
    if (this.disposed) {
      throw new Error(`AnalysisContext is disposed (called ${method}).`);
    }
  }

  get repositoryRoot(): string {
    this.assertUsable("repositoryRoot");
    return this.repositoryRootAbsolute;
  }

  get canonicalPaths(): readonly CanonicalPath[] {
    this.assertUsable("canonicalPaths");
    return [...this.sortedCanonicalPaths];
  }

  get program(): ts.Program {
    this.assertUsable("program");

    if (!this.ownedProgram) {
      throw new Error("AnalysisContext program is unavailable.");
    }

    return this.ownedProgram;
  }

  get checker(): ts.TypeChecker {
    this.assertUsable("checker");

    if (!this.ownedChecker) {
      throw new Error("AnalysisContext checker is unavailable.");
    }

    return this.ownedChecker;
  }

  get compilerOptions(): Readonly<ts.CompilerOptions> {
    this.assertUsable("compilerOptions");
    return { ...this.lockedCompilerOptions };
  }

  getSource(canonicalPath: CanonicalPath): string | undefined {
    this.assertUsable("getSource");
    return this.canonicalSources.get(canonicalPath);
  }

  hasSource(canonicalPath: CanonicalPath): boolean {
    this.assertUsable("hasSource");
    return this.canonicalSources.has(canonicalPath);
  }

  toCanonical(inputPath: string): CanonicalPath | undefined {
    this.assertUsable("toCanonical");
    return normalizeCanonicalPath(inputPath);
  }

  toAbsolute(canonicalPath: CanonicalPath): string {
    this.assertUsable("toAbsolute");
    return resolve(this.repositoryRootAbsolute, canonicalPath);
  }

  toVirtualPath(canonicalPath: CanonicalPath): string {
    this.assertUsable("toVirtualPath");
    return toAnalysisVirtualPath(canonicalPath);
  }

  resolveDeclaration(
    node: Pick<CallGraphNode, "symbolName" | "filePath" | "line">,
  ): DeclarationId | undefined {
    this.assertUsable("resolveDeclaration");

    const canonical = normalizeCanonicalPath(node.filePath);

    if (canonical === undefined) {
      return undefined;
    }

    const ids = this.tableByFile.get(canonical);

    if (!ids || ids.length === 0) {
      return undefined;
    }

    const records: DeclarationRecord[] = [];

    for (const id of ids) {
      const record = this.tableDeclarations.get(id);

      if (record) {
        records.push(record);
      }
    }

    return findBestDeclarationMatch(records, node.symbolName, node.line)?.id;
  }

  declarationOf(id: DeclarationId): DeclarationRecord | undefined {
    this.assertUsable("declarationOf");
    return this.tableDeclarations.get(id);
  }

  symbolOf(id: SymbolId): SymbolRecord | undefined {
    this.assertUsable("symbolOf");
    return this.tableSymbols.get(id);
  }

  moduleEdgesOf(canonicalPath: CanonicalPath): ModuleEdge[] {
    this.assertUsable("moduleEdgesOf");
    return [...(this.moduleEdgesByFrom.get(canonicalPath) ?? [])];
  }

  /** All module edges in deterministic (from, specifier) order. */
  allModuleEdges(): ModuleEdge[] {
    this.assertUsable("allModuleEdges");
    return [...this.tableModuleEdges];
  }

  /** All declaration records in deterministic ID order. */
  allDeclarations(): DeclarationRecord[] {
    this.assertUsable("allDeclarations");
    return [...this.tableDeclarations.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  /** All alias records (re-export linkage). */
  allAliases(): readonly AliasRecord[] {
    this.assertUsable("allAliases");
    return [...this.tableAliases];
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.ownedProgram = undefined;
    this.ownedChecker = undefined;
    this.canonicalSources.clear();
    this.tableDeclarations.clear();
    this.tableSymbols.clear();
    this.tableByFile.clear();
    this.moduleEdgesByFrom.clear();
  }
}
