export type RepositoryFileKind =
  | "source"
  | "test"
  | "documentation"
  | "config"
  | "unknown";

export interface RepositoryFile {
  relativePath: string;
  extension: string;
  kind: RepositoryFileKind;
}

export interface RepositoryStatistics {
  totalFiles: number;
  languages: Record<string, number>;
}

export interface RepositoryManifest {
  repositoryRoot: string;
  files: RepositoryFile[];
  topLevelDirectories: string[];
  statistics: RepositoryStatistics;
  packageManagers: string[];
}
