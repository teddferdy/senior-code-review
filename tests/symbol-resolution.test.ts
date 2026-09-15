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

describe("nested scope resolution", () => {
  it("resolves references to the outer function symbol from a nested function", () => {
    const sourceCode = `
function foo() {}

function outer() {
  function inner() {
    return foo();
  }

  return inner();
}
`;

    expect(
      resolveSymbolReferences(sourceCode, "example.ts", "foo"),
    ).toEqual([
      {
        symbolName: "foo",
        filePath: "example.ts",
        line: 6,
      },
    ]);
  });
});

describe("nested scope shadowing", () => {
  it("does not resolve a shadowed symbol inside a nested function", () => {
    const sourceCode = `
function foo() {}

function outer() {
  function inner() {
    function foo() {
      return 1;
    }

    return foo();
  }

  return inner();
}
`;

    expect(
      resolveSymbolReferences(sourceCode, "example.ts", "foo"),
    ).toEqual([]);
  });
});
