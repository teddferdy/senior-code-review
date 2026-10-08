# senior-code-reviewer

Deterministic V1 product/execution layer over 19 existing evidence-only
review evaluators (`REV-*-001`).

One reviewer question, one execution contract, one deterministic report.
No new rules. No severity, confidence, remediation, or autofix. No policy
invention.

## 1. Installation / build

Requires Node.js 20+ and TypeScript (see `package.json`).

```sh
npm install
npm run build   # typecheck + emit to dist/
npm test        # full suite (vitest)
```

## 2. API invocation

```ts
import { runV1Review } from "senior-code-reviewer";

const report = runV1Review("/path/to/repo", {
  enabledRules: ["REV-CYCLE-001"], // optional; default: all 19 rules
  format: "json",                  // optional; "json" (default) | "text"
  outputPath: "review.json",       // optional; writes rendered report to file
});
```

`runV1Review` is synchronous and directly testable without spawning a
CLI. Related exports: `runV1ReviewWithEntries` (same behavior with an
explicit registry; used as the controlled test seam),
`getV1ReviewExitCode(report)`, `renderV1ReviewJson(report)`,
`renderV1ReviewText(report)`, `V1_RULE_REGISTRY`, `loadV1Sources`.

## 3. CLI invocation

```sh
node dist/cli.js <repositoryRoot>
senior-code-reviewer [--format json|text] [--output <path>] [--rule <id>...] <repositoryRoot>
```

(`senior-code-reviewer` is available as a `bin` entry after `npm run build`;
it points at `dist/cli.js`.)

## 4. CLI flags

| Flag | Required | Repeatable | Meaning |
| ---- | -------- | ---------- | ------- |
| `<repositoryRoot>` | yes (exactly one) | no | Repository directory to analyze |
| `--format json\|text` (or `--format=json`) | no | no | Output rendering. Default: `json`, independent of TTY state |
| `--output <path>` (or `--output=<path>`) | no | no | Write the rendered report to this explicit path instead of stdout |
| `--rule <id>` (or `--rule=<id>`) | no | yes | Restrict the review to these rule IDs |
| `--help` / `-h` | no | no | Print usage, exit 0 |

## 5. Input contract

- `repositoryRoot` must exist and must be a directory; otherwise the
  review returns `status: "inputError"` (CLI exit 2).
- The loader walks the directory deterministically, reads supported
  source files as UTF-8, and never modifies the repository.
- `--rule` values must be known rule IDs; unknown IDs are rejected
  deterministically (`inputError`, exit 2). Supplied IDs are
  deduplicated and lexically sorted; execution always follows registry
  order, never CLI argument order.

## 6. Supported extensions

Only `.ts`, `.tsx`, `.js`, `.jsx` (case-insensitive) are loaded into the
analysis. All other files are ignored for evaluation purposes.

## 7. Default full-19 behavior

With no `--rule` / `enabledRules`, all 19 evaluators run, each invoked
as `evaluate(context, { applicable: true })`. That call is the
owner-authored applicability declaration required by each rule's
SPECIFIC-TARGET semantics.

## 8. Rule subset behavior

Rules not selected are **not invoked** and are reported as
`{ evaluated: false, violationCount: 0, violations: [] }` — the exact
existing "not evaluated" shape, which is neither pass nor fail and is
never treated as an error.

## 9. JSON output contract

JSON is the normative machine-readable representation. Shape:

```json
{
  "tool": { "name": "senior-code-reviewer", "version": "0.1.0" },
  "target": { "repositoryRoot": "/abs/path", "fileCount": 3, "files": ["src/a.ts"] },
  "status": "completed",
  "rules": [
    {
      "ruleId": "REV-ARCH-001",
      "evaluated": true,
      "violationCount": 0,
      "violations": []
    }
  ],
  "summary": { "rulesEvaluated": 19, "rulesSkipped": 0, "rulesErrored": 0, "totalViolations": 0 }
}
```

- `status`: `completed` | `completedWithErrors` | `inputError`.
- A per-rule `error: { message }` appears only when that evaluator
  threw (message only, never a stack trace). A top-level
  `error: { message }` appears only when `status` is `inputError`.
- `summary` is strictly derived from the rule entries.
- A rule's `violations` array contains exactly the objects produced by
  its evaluator (heterogeneous per-rule shapes are preserved
  intentionally; there is no common finding model).

## 10. Text output

`--format text` renders the same report model for humans: tool/target/
status header, file list, one section per rule (`evaluated — N
violation(s)` with compact-JSON evidence lines, `skipped`, or `error`),
and a summary line. There is intentionally no per-rule
message-generation system; evidence is rendered generically.

## 11. Finding interpretation

Findings are evidence-only facts owned by their rule (for example,
`REV-UNREF-001` reports "no qualifying inbound reference was observed
under `src/**`", never "this module is definitely unused"). Interpret
each `violations` entry using that rule's locked semantics documented
in its `src/repository/rev-*.ts` header comment — including the "Known
limitations" section. The product layer adds no meaning beyond what the
evaluator produced.

## 12. Exit-code table

| Situation | Status | Exit |
| --------- | ------ | ---: |
| 0 violations, no error | `completed` | 0 |
| ≥1 violation, no error | `completed` | 1 |
| evaluator error (partial report still produced) | `completedWithErrors` | 2 |
| invalid input | `inputError` | 2 |
| context/source loading failure | `inputError` | 2 |
| output cannot be written | `inputError` | 2 |

Finding violations is not execution failure. If violations and
evaluator errors coexist, failure dominates: exit 2.

## 13. Supported scope

Whole-repository V1 review: module structure, import graph, V1 call
graph, and declaration facts derived statically from the supported
source files. Existing direct imports (`evaluateRev*001(...)`) remain
supported with unchanged signatures.

## 14. Known limitations (inherited from existing rule headers)

The analysis is static source analysis: path aliases and package
`#imports` resolve as external edges; dynamic `import()`,
non-literal loading, and `require()` produce no edges; constructors /
`new`, callbacks, `.call`/`.apply`/`.bind`, `Reflect`, `eval`, and
dynamic member access are unrepresented in the V1 call graph; external
consumers, framework registration, reflection, and dependency
injection are invisible. See each rule's header comment for its exact
limitations — they are never repeated inside violation data.

## 15. Determinism guarantee

For identical repository bytes, identical configuration, and identical
tool version, the JSON report is **byte-identical** across runs. Rule
order follows the static registry; findings keep evaluator-provided
order (never re-sorted); files are in unit-code lexical order. The
report contains no timestamps, durations, random IDs, or
machine-specific metadata. (One deliberate consequence: stack traces
are excluded from per-rule errors.)

The loader skips symlinks (never follows them) and skips the
directories `.git`, `node_modules`, `dist`, `build`, `coverage`,
`.next`, `.turbo`, `.cache`, `target`, `vendor` — the same conservative
set already used by `RepositoryScanner`. No output files are ever
created inside the analyzed repository implicitly.

## 16. Versioning

Report output carries the tool version (`tool.version`, currently
`0.1.0`, always equal to `package.json`). Determinism is guaranteed per
tool version; evaluator or product changes in a new version may change
output bytes.

## 17. Private package statement

This package is `private: true` (version `0.1.0`) and is **not
published** to any registry. The only packaging surface is the local
`bin` entry (`senior-code-reviewer` → `dist/cli.js`).
