import { describe, expect, it } from "vitest";

import { buildSymbolIndex } from "../src/repository/symbol-index.js";

describe("SymbolIndex", () => {
  it("indexes symbols by file", () => {
    const index = buildSymbolIndex({
      "src/order.ts": "function createOrder() {}",
      "src/customer.ts": "function createCustomer() {}",
    });

    expect(index).toEqual({
      symbolsByFile: {
        "src/order.ts": [
          {
            name: "createOrder",
            kind: "function",
            filePath: "src/order.ts",
            line: 1,
            exported: false,
          },
        ],
        "src/customer.ts": [
          {
            name: "createCustomer",
            kind: "function",
            filePath: "src/customer.ts",
            line: 1,
            exported: false,
          },
        ],
      },
    });
  });
});
