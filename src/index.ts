/*
 * senior-code-reviewer — public product surface (V1).
 *
 * Additive product layer over the 19 existing deterministic
 * evaluators. Evaluator modules under `./repository/rev-*.ts` remain
 * directly importable with unchanged signatures and semantics.
 */

export {
  REV_RULE_IDS,
  V1_RULE_REGISTRY,
  isRevRuleId,
  type RevRuleId,
  type V1RegistryEntry,
  type V1RuleEvaluate,
} from "./review/registry.js";
export {
  V1_LOADER_IGNORED_DIRECTORIES,
  loadV1Sources,
  type V1LoadedSources,
} from "./review/loader.js";
export {
  TOOL_NAME,
  TOOL_VERSION,
  getV1ReviewExitCode,
  renderV1ReviewJson,
  renderV1ReviewText,
  type V1ReviewExitCode,
  type V1ReviewReport,
  type V1ReviewStatus,
  type V1ReviewSummary,
  type V1RuleReportEntry,
} from "./review/report.js";
export {
  runV1Review,
  runV1ReviewWithEntries,
  selectV1RuleIds,
  type RunV1ReviewOptions,
  type V1ReviewFormat,
} from "./review/runner.js";
