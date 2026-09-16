import { describe, expect, it } from "vitest";

import { findSymbolReferenceContext } from "../src/repository/symbol-reference-context.js";

describe("findSymbolReferenceContext", () => {
  it("returns all references and calls for a symbol", () => {
    const sourceCode = `
function foo() {}
const value = foo;
foo();
`;

    expect(
      findSymbolReferenceContext(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual({
      references: [
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
      ],
      calls: [
        {
          symbolName: "foo",
          filePath: "example.ts",
          line: 4,
        },
      ],
    });
  });

  it("returns empty collections when there are no references", () => {
    const sourceCode = `
function bar() {}
`;

    expect(
      findSymbolReferenceContext(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual({
      references: [],
      calls: [],
    });
  });

  it("preserves reference and call ordering", () => {
    const sourceCode = `
function foo() {}
foo;
foo();
foo;
foo();
`;

    expect(
      findSymbolReferenceContext(
        { "example.ts": sourceCode },
        "example.ts",
        "foo",
      ),
    ).toEqual({
      references: [
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
        {
          symbolName: "foo",
          filePath: "example.ts",
          line: 5,
        },
        {
          symbolName: "foo",
          filePath: "example.ts",
          line: 6,
        },
      ],
      calls: [
        {
          symbolName: "foo",
          filePath: "example.ts",
          line: 4,
        },
        {
          symbolName: "foo",
          filePath: "example.ts",
          line: 6,
        },
      ],
    });
  });
});
