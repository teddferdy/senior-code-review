import { describe, expect, it } from "vitest";

import { findSymbolCallContexts } from "../src/repository/symbol-call-context.js";

describe("findSymbolCallContexts", () => {
  it("detects a function call", () => {
    const sourceCode = `
function foo() {}
foo();
`;

    expect(findSymbolCallContexts(sourceCode, "example.ts", "foo")).toEqual([
      {
        symbolName: "foo",
        filePath: "example.ts",
        line: 3,
      },
    ]);
  });

  it("does not classify a plain reference as a call", () => {
    const sourceCode = `
function foo() {}
const value = foo;
`;

    expect(findSymbolCallContexts(sourceCode, "example.ts", "foo")).toEqual([]);
  });

  it("detects multiple calls in source order", () => {
    const sourceCode = `
function foo() {}
foo();
foo();
`;

    expect(findSymbolCallContexts(sourceCode, "example.ts", "foo")).toEqual([
      {
        symbolName: "foo",
        filePath: "example.ts",
        line: 3,
      },
      {
        symbolName: "foo",
        filePath: "example.ts",
        line: 4,
      },
    ]);
  });

  it("excludes the function declaration itself", () => {
    const sourceCode = `
function foo() {}
`;

    expect(findSymbolCallContexts(sourceCode, "example.ts", "foo")).toEqual([]);
  });
});
