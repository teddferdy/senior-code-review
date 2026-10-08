import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  REV_RULE_IDS,
  V1_RULE_REGISTRY,
} from "../src/review/registry.js";

const EXPECTED_RULE_IDS = [
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
];

describe("V1 rule registry", () => {
  it("contains exactly the 19 expected rules", () => {
    expect(V1_RULE_REGISTRY).toHaveLength(19);
    expect(REV_RULE_IDS).toHaveLength(19);
    expect(V1_RULE_REGISTRY.map((entry) => entry.ruleId)).toEqual(
      EXPECTED_RULE_IDS,
    );
  });

  it("has unique rule IDs", () => {
    const ids = V1_RULE_REGISTRY.map((entry) => entry.ruleId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares entries in lexical rule-ID order (unit-code ordering)", () => {
    const ids = V1_RULE_REGISTRY.map((entry) => entry.ruleId);
    const sorted = [...ids].sort();

    expect(ids).toEqual(sorted);
  });

  it("exposes a callable evaluator for every entry", () => {
    for (const entry of V1_RULE_REGISTRY) {
      expect(typeof entry.evaluate).toBe("function");
    }
  });

  it("carries no metadata beyond ruleId and evaluate", () => {
    for (const entry of V1_RULE_REGISTRY) {
      expect(Object.keys(entry).sort()).toEqual(["evaluate", "ruleId"]);
    }
  });

  it("is not imported by any evaluator file", () => {
    for (const ruleId of EXPECTED_RULE_IDS) {
      const slug = ruleId.toLowerCase();
      const path = new URL(`../src/repository/${slug}.ts`, import.meta.url);

      const text = readFileSync(path, "utf8");

      expect(text).not.toContain("review/registry");
    }
  });
});
