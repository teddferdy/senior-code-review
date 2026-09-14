import { describe, expect, it } from "vitest";

import { findSymbolReferences } from "../src/repository/symbol-reference.js";

describe("findSymbolReferences", () => {
  it("finds identifier references", () => {
    const sourceCode = `const order = createOrder();
createOrder();`;
    const filePath = "src/checkout.ts";
    const symbolName = "createOrder";

    const references = findSymbolReferences(sourceCode, filePath, symbolName);

    expect(references).toHaveLength(2);
    expect(references[0]).toEqual({
      symbolName: "createOrder",
      filePath: "src/checkout.ts",
      line: 1,
    });
    expect(references[1]).toEqual({
      symbolName: "createOrder",
      filePath: "src/checkout.ts",
      line: 2,
    });
  });

  it("reports correct line numbers", () => {
    const sourceCode = `const order = createOrder();

function checkout() {
  return createOrder();
}`;
    const filePath = "src/checkout.ts";
    const symbolName = "createOrder";

    const references = findSymbolReferences(sourceCode, filePath, symbolName);

    expect(references).toHaveLength(2);
    expect(references.map((ref) => ref.line)).toEqual([1, 4]);
    expect(references[0].filePath).toBe(filePath);
    expect(references[1].filePath).toBe(filePath);
    expect(references[0].symbolName).toBe(symbolName);
    expect(references[1].symbolName).toBe(symbolName);
  });

  it("does not include the declaration", () => {
    const sourceCode = `function createOrder() {
  return true;
}

createOrder();`;
    const filePath = "src/order.ts";
    const symbolName = "createOrder";

    const references = findSymbolReferences(sourceCode, filePath, symbolName);

    expect(references).toHaveLength(1);
    expect(references[0]).toEqual({
      symbolName: "createOrder",
      filePath: "src/order.ts",
      line: 5,
    });
  });

  it("does not match unrelated identifiers", () => {
    const sourceCode = `const createOrder = true;
const createOrderDraft = false;

createOrderDraft;`;
    const filePath = "src/order.ts";
    const symbolName = "createOrder";

    const references = findSymbolReferences(sourceCode, filePath, symbolName);

    expect(references).toEqual([]);
    // Ensure no false positive for similar name
    expect(references.some((ref) => ref.symbolName === "createOrderDraft")).toBe(false);
    expect(references.some((ref) => ref.line === 2 || ref.line === 3)).toBe(false);
  });

  it("returns an empty array when no reference exists", () => {
    const sourceCode = `const order = 1;
function checkout() {
  return order;
}`;
    const filePath = "src/checkout.ts";
    const symbolName = "createOrder";

    const references = findSymbolReferences(sourceCode, filePath, symbolName);

    expect(references).toEqual([]);
    expect(references).toHaveLength(0);
  });
});
