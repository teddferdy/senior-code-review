import { describe, expect, it } from "vitest";

import { resolveSymbolReferences } from "../src/repository/symbol-resolution.js";

describe("resolveSymbolReferences", () => {
  it("resolves references to the declared function symbol", () => {
    const sourceCode = `
function foo() {}
const value = foo;
foo();
`;

    expect(resolveSymbolReferences(sourceCode, "example.ts", "foo")).toEqual([
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

  it("does not resolve references to a different symbol with the same name", () => {
    const sourceCode = `
function foo() {
  const foo = 1;
  return foo;
}
`;

    expect(resolveSymbolReferences(sourceCode, "example.ts", "foo")).toEqual(
      [],
    );
  });

  it("returns an empty collection when the symbol does not exist", () => {
    const sourceCode = `
function bar() {}
bar();
`;

    expect(resolveSymbolReferences(sourceCode, "example.ts", "foo")).toEqual(
      [],
    );
  });
});
