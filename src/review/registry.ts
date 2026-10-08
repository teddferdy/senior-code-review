import type { AnalysisContext } from "../repository/analysis-context.js";
import { evaluateRevArch001 } from "../repository/rev-arch-001.js";
import { evaluateRevArchTrans001 } from "../repository/rev-arch-trans-001.js";
import { evaluateRevCallbound001 } from "../repository/rev-callbound-001.js";
import { evaluateRevCallchainless001 } from "../repository/rev-callchainless-001.js";
import { evaluateRevCallcycle001 } from "../repository/rev-callcycle-001.js";
import { evaluateRevCycle001 } from "../repository/rev-cycle-001.js";
import { evaluateRevDupedge001 } from "../repository/rev-dupedge-001.js";
import { evaluateRevNoout001 } from "../repository/rev-noout-001.js";
import { evaluateRevOverloadpartial001 } from "../repository/rev-overloadpartial-001.js";
import { evaluateRevSelfimport001 } from "../repository/rev-selfimport-001.js";
import { evaluateRevSpecincon001 } from "../repository/rev-specincon-001.js";
import { evaluateRevTestdep001 } from "../repository/rev-testdep-001.js";
import { evaluateRevTestdepTrans001 } from "../repository/rev-testdep-trans-001.js";
import { evaluateRevTestonlycall001 } from "../repository/rev-testonlycall-001.js";
import { evaluateRevTestonlycallprop001 } from "../repository/rev-testonlycallprop-001.js";
import { evaluateRevUnref001 } from "../repository/rev-unref-001.js";
import { evaluateRevUnrefcall001 } from "../repository/rev-unrefcall-001.js";
import { evaluateRevUnrefcallprop001 } from "../repository/rev-unrefcallprop-001.js";
import { evaluateRevUnres001 } from "../repository/rev-unres-001.js";

/*
 * V1 rule registry — K21 §F/G exact spec lock.
 *
 * A static array of exactly the 19 existing evaluator references, in
 * lexical rule-ID order (ordinary UTF-16 code-unit `<` ordering —
 * never locale-dependent comparison, never filesystem enumeration,
 * never dynamic imports). Declaration order == lexical order by
 * construction.
 *
 * Each entry carries only the identity + evaluator reference required
 * to execute a unified review. No severity, confidence, category, or
 * other metadata: every field must have a purpose, and V1 has no
 * purpose for those fields (rules are evidence-only by locked
 * semantics).
 */

export const REV_RULE_IDS = [
  "REV-ARCH-001",
  "REV-ARCH-TRANS-001",
  "REV-CALLBOUND-001",
  "REV-CALLCHAINLESS-001",
  "REV-CALLCYCLE-001",
  "REV-CYCLE-001",
  "REV-DUPEDGE-001",
  "REV-NOOUT-001",
  "REV-OVERLOADPARTIAL-001",
  "REV-SELFIMPORT-001",
  "REV-SPECINCON-001",
  "REV-TESTDEP-001",
  "REV-TESTDEP-TRANS-001",
  "REV-TESTONLYCALL-001",
  "REV-TESTONLYCALLPROP-001",
  "REV-UNREF-001",
  "REV-UNREFCALL-001",
  "REV-UNREFCALLPROP-001",
  "REV-UNRES-001",
] as const;

export type RevRuleId = (typeof REV_RULE_IDS)[number];

export type V1RuleEvaluate = (
  context: AnalysisContext,
  options?: { applicable?: boolean },
) => { evaluated: boolean; violations: readonly unknown[] };

export interface V1RegistryEntry {
  readonly ruleId: RevRuleId;
  readonly evaluate: V1RuleEvaluate;
}

export const V1_RULE_REGISTRY: readonly V1RegistryEntry[] = [
  { ruleId: "REV-ARCH-001", evaluate: evaluateRevArch001 },
  { ruleId: "REV-ARCH-TRANS-001", evaluate: evaluateRevArchTrans001 },
  { ruleId: "REV-CALLBOUND-001", evaluate: evaluateRevCallbound001 },
  { ruleId: "REV-CALLCHAINLESS-001", evaluate: evaluateRevCallchainless001 },
  { ruleId: "REV-CALLCYCLE-001", evaluate: evaluateRevCallcycle001 },
  { ruleId: "REV-CYCLE-001", evaluate: evaluateRevCycle001 },
  { ruleId: "REV-DUPEDGE-001", evaluate: evaluateRevDupedge001 },
  { ruleId: "REV-NOOUT-001", evaluate: evaluateRevNoout001 },
  { ruleId: "REV-OVERLOADPARTIAL-001", evaluate: evaluateRevOverloadpartial001 },
  { ruleId: "REV-SELFIMPORT-001", evaluate: evaluateRevSelfimport001 },
  { ruleId: "REV-SPECINCON-001", evaluate: evaluateRevSpecincon001 },
  { ruleId: "REV-TESTDEP-001", evaluate: evaluateRevTestdep001 },
  { ruleId: "REV-TESTDEP-TRANS-001", evaluate: evaluateRevTestdepTrans001 },
  { ruleId: "REV-TESTONLYCALL-001", evaluate: evaluateRevTestonlycall001 },
  { ruleId: "REV-TESTONLYCALLPROP-001", evaluate: evaluateRevTestonlycallprop001 },
  { ruleId: "REV-UNREF-001", evaluate: evaluateRevUnref001 },
  { ruleId: "REV-UNREFCALL-001", evaluate: evaluateRevUnrefcall001 },
  { ruleId: "REV-UNREFCALLPROP-001", evaluate: evaluateRevUnrefcallprop001 },
  { ruleId: "REV-UNRES-001", evaluate: evaluateRevUnres001 },
];

const V1_RULE_ID_SET: ReadonlySet<string> = new Set(REV_RULE_IDS);

export function isRevRuleId(value: string): value is RevRuleId {
  return V1_RULE_ID_SET.has(value);
}
