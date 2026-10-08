import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCliArgs, runCli } from "../src/cli.js";
import { renderV1ReviewJson, renderV1ReviewText } from "../src/review/report.js";
import { runV1Review } from "../src/review/runner.js";

function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "v1-cli-"));

  for (const [relativePath, text] of Object.entries(files)) {
    const absolute = join(dir, relativePath);

    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text, "utf8");
  }

  return dir;
}

function removeRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("V1 CLI argument parsing", () => {
  it("requires exactly one repository root", () => {
    expect(parseCliArgs([]).ok).toBe(false);
    expect(parseCliArgs(["a", "b"]).ok).toBe(false);
  });

  it("defaults to json format with all rules enabled", () => {
    const parsed = parseCliArgs(["/repo"]);

    expect(parsed.ok).toBe(true);

    if (parsed.ok && !parsed.help) {
      expect(parsed.options?.format).toBe("json");
      expect(parsed.options?.enabledRules).toBeUndefined();
      expect(parsed.options?.outputPath).toBeUndefined();
    }
  });

  it("accepts explicit format, output, and repeatable rule flags", () => {
    const parsed = parseCliArgs([
      "--format",
      "text",
      "--output",
      "out.txt",
      "--rule",
      "REV-UNRES-001",
      "--rule=REV-ARCH-001",
      "--rule",
      "REV-ARCH-001",
      "/repo",
    ]);

    expect(parsed.ok).toBe(true);

    if (parsed.ok && !parsed.help) {
      expect(parsed.options?.format).toBe("text");
      expect(parsed.options?.outputPath).toBe("out.txt");
      expect(parsed.options?.enabledRules).toEqual([
        "REV-ARCH-001",
        "REV-UNRES-001",
      ]);
    }
  });

  it("rejects unknown options, bad formats, and missing values", () => {
    expect(parseCliArgs(["--nope", "/repo"]).ok).toBe(false);
    expect(parseCliArgs(["--format", "yaml", "/repo"]).ok).toBe(false);
    expect(parseCliArgs(["--format", "/repo"]).ok).toBe(false);
    expect(parseCliArgs(["--output", "/repo"]).ok).toBe(false);
    expect(parseCliArgs(["--rule", "/repo"]).ok).toBe(false);
  });

  it("answers --help without requiring a repository root", () => {
    const parsed = parseCliArgs(["--help"]);

    expect(parsed.ok).toBe(true);

    if (parsed.ok) {
      expect(parsed.help).toBe(true);
    }
  });
});

describe("V1 CLI execution", () => {
  it(
    "exits 0 with default JSON on a clean repository",
    () => {
      const dir = makeRepo({});

      try {
        const result = runCli([dir]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");

        const parsed = JSON.parse(result.stdout) as { status: string };

        expect(parsed.status).toBe("completed");
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it(
    "exits 1 with findings and supports text format plus output files",
    () => {
      const dir = makeRepo({ "src/a.ts": "export const a = 1;\n" });
      const outputPath = join(dir, "review.txt");

      try {
        const json = runCli([dir]);

        expect(json.exitCode).toBe(1);
        expect(
          (JSON.parse(json.stdout) as { status: string }).status,
        ).toBe("completed");

        const text = runCli([dir, "--format", "text"]);

        expect(text.exitCode).toBe(1);
        expect(text.stdout).toContain("senior-code-reviewer");
        expect(text.stdout).toContain("status: completed");

        const viaFile = runCli([dir, "--output", outputPath]);

        expect(viaFile.exitCode).toBe(1);
        expect(viaFile.stdout).toBe("");
        expect(readFileSync(outputPath, "utf8")).toBe(
          renderV1ReviewJson(runV1Review(dir)),
        );
      } finally {
        removeRepo(dir);
      }
    },
    120000,
  );

  it(
    "exits 2 with an inputError report for unknown rule IDs",
    () => {
      const dir = makeRepo({});

      try {
        const result = runCli([dir, "--rule", "REV-NOPE-001"]);

        expect(result.exitCode).toBe(2);

        const parsed = JSON.parse(result.stdout) as {
          status: string;
          error: { message: string };
        };

        expect(parsed.status).toBe("inputError");
        expect(parsed.error.message).toContain("REV-NOPE-001");
      } finally {
        removeRepo(dir);
      }
    },
    60000,
  );

  it("exits 2 on stderr for missing repository argument", () => {
    const result = runCli([]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Missing required");
  });

  it(
    "matches the API report byte-for-byte through a spawned process",
    () => {
      const cliPath = new URL("../dist/cli.js", import.meta.url);

      if (!existsSync(cliPath)) {
        throw new Error(
          "dist/cli.js is missing. Run `npm run build` before the CLI spawn test.",
        );
      }

      const dir = makeRepo({ "src/a.ts": "export const a = 1;\n" });

      try {
        const expected = renderV1ReviewJson(runV1Review(dir));

        let stdout = "";
        let status = 0;

        try {
          stdout = execFileSync("node", [cliPath.pathname, dir], {
            encoding: "utf8",
          });
        } catch (error) {
          const failure = error as {
            status?: number;
            stdout?: string | Buffer;
          };

          status = failure.status ?? 1;
          stdout =
            typeof failure.stdout === "string"
              ? failure.stdout
              : String(failure.stdout ?? "");
        }

        expect(status).toBe(1);
        expect(stdout).toBe(expected);
      } finally {
        removeRepo(dir);
      }
    },
    120000,
  );
});
