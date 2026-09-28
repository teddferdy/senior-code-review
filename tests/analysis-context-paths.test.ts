import { describe, expect, it } from "vitest";

import { normalizeCanonicalPath } from "../src/repository/declaration-ids.js";
import { AnalysisContext } from "../src/repository/analysis-context.js";

describe("canonical path normalization", () => {
  it("keeps simple relative paths unchanged", () => {
    expect(normalizeCanonicalPath("foo.ts")).toBe("foo.ts");
    expect(normalizeCanonicalPath("src/a.ts")).toBe("src/a.ts");
  });

  it("converts backslashes to forward slashes", () => {
    expect(normalizeCanonicalPath("src\\a.ts")).toBe("src/a.ts");
    expect(normalizeCanonicalPath("src\\sub\\b.ts")).toBe("src/sub/b.ts");
  });

  it("strips ./ prefixes and leading slashes", () => {
    expect(normalizeCanonicalPath("./a.ts")).toBe("a.ts");
    expect(normalizeCanonicalPath("./src/a.ts")).toBe("src/a.ts");
    expect(normalizeCanonicalPath("/a/b.ts")).toBe("a/b.ts");
    expect(normalizeCanonicalPath("/./a.ts")).toBe("a.ts");
  });

  it("collapses repeated slashes", () => {
    expect(normalizeCanonicalPath("src//a.ts")).toBe("src/a.ts");
    expect(normalizeCanonicalPath("//a//b.ts")).toBe("a/b.ts");
  });

  it("resolves dot segments", () => {
    expect(normalizeCanonicalPath("a/../b.ts")).toBe("b.ts");
    expect(normalizeCanonicalPath("src/./a.ts")).toBe("src/a.ts");
  });

  it("rejects empty and escaping paths", () => {
    expect(normalizeCanonicalPath("")).toBeUndefined();
    expect(normalizeCanonicalPath(".")).toBeUndefined();
    expect(normalizeCanonicalPath("./")).toBeUndefined();
    expect(normalizeCanonicalPath("../a.ts")).toBeUndefined();
    expect(normalizeCanonicalPath("a/../../b.ts")).toBeUndefined();
    expect(normalizeCanonicalPath("..")).toBeUndefined();
  });

  it("rejects windows drive-absolute paths as outside-root", () => {
    expect(normalizeCanonicalPath("C:/repo/a.ts")).toBeUndefined();
    expect(normalizeCanonicalPath("C:\\repo\\a.ts")).toBeUndefined();
  });

  it("preserves case", () => {
    expect(normalizeCanonicalPath("Src/A.TS")).toBe("Src/A.TS");
  });
});

describe("source ingestion", () => {
  it(
    "normalizes keys and deduplicates deterministically",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "./b.ts": "export const b = 1;",
          "b.ts": "export const b = 2;",
          "a.ts": "export const a = 1;",
        },
      });

      // Canonical keys converge; sorted-input processing is deterministic.
      expect(context.canonicalPaths).toEqual(["a.ts", "b.ts"]);
      expect(context.hasSource("b.ts")).toBe(true);

      context.dispose();
    },
    30000,
  );

  it(
    "supports virtual fixture style keys without filesystem access",
    () => {
      const context = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "domain/user-service.ts": "export class UserService {}",
          "app/consumer.ts":
            'import { UserService } from "../domain/user-service";',
        },
      });

      expect(context.toCanonical("domain/user-service.ts")).toBe(
        "domain/user-service.ts",
      );
      expect(
        context.getSource("app/consumer.ts"),
      ).toContain("../domain/user-service");

      context.dispose();
    },
    30000,
  );

  it(
    "applies an include filter when provided",
    () => {
      const byPattern = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "src/a.ts": "export const a = 1;",
          "src/b.ts": "export const b = 1;",
        },
        include: /^src\/a\.ts$/,
      });

      expect(byPattern.canonicalPaths).toEqual(["src/a.ts"]);

      const byFunction = new AnalysisContext({
        repositoryRoot: "/repo",
        sources: {
          "src/a.ts": "export const a = 1;",
          "src/b.ts": "export const b = 1;",
        },
        include: (path) => path.endsWith("b.ts"),
      });

      expect(byFunction.canonicalPaths).toEqual(["src/b.ts"]);

      byPattern.dispose();
      byFunction.dispose();
    },
    30000,
  );

  it("rejects an empty repository root", () => {
    expect(
      () =>
        new AnalysisContext({
          repositoryRoot: "",
          sources: { "a.ts": "" },
        }),
    ).toThrow();
  });
});
