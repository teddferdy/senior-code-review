import { describe, expect, it } from "vitest";

import { resolveSymbolReferences } from "../src/repository/symbol-resolution.js";

describe("resolveSymbolReferences", () => {
  it("resolves references to the declared function symbol", () => {
    const sourceCode = `
function foo() {}
const value = foo;
foo();
`;

    expect(
      resolveSymbolReferences(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual([
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

    expect(
      resolveSymbolReferences(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual([]);
  });

  it("returns an empty collection when the symbol does not exist", () => {
    const sourceCode = `
function bar() {}
bar();
`;

    expect(
      resolveSymbolReferences(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual([]);
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
      resolveSymbolReferences(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
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
      resolveSymbolReferences(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual([]);
  });
});

describe("cross-file symbol resolution", () => {
  it("resolves an imported function reference to its exported symbol", () => {
    const sources = {
      "foo.ts": `
export function foo() {}
`,
      "consumer.ts": `
import { foo } from "./foo";

foo();
`,
    };

    expect(resolveSymbolReferences(sources, "foo.ts", "foo")).toEqual([
      {
        symbolName: "foo",
        filePath: "consumer.ts",
        line: 4,
      },
    ]);
  });
});

describe("cross-file regression", () => {
  it("regression: consumer imports foo from ./foo should resolve via virtual directoryExists", () => {
    const sources = {
      "foo.ts": `
export function foo() {}
`,
      "consumer.ts": `
import { foo } from "./foo";

foo();
`,
    };

    expect(resolveSymbolReferences(sources, "foo.ts", "foo")).toEqual([
      {
        symbolName: "foo",
        filePath: "consumer.ts",
        line: 4,
      },
    ]);
  });
});
