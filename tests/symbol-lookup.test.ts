import { describe, expect, it } from "vitest";

import {
  findSymbol,
  findSymbolsByName,
  findExportedSymbolsByName,
} from "../src/repository/symbol-lookup.js";

import type { SymbolIndex } from "../src/repository/symbol-index.js";

describe("findSymbol", () => {
  it("finds a symbol by file and name", () => {
    const index: SymbolIndex = {
      symbolsByFile: {
        "src/order.ts": [
          {
            name: "createOrder",
            kind: "function",
            filePath: "src/order.ts",
            line: 1,
            exported: true,
          },
        ],
      },
    };

    expect(findSymbol(index, "src/order.ts", "createOrder")).toEqual({
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    });
  });

  it("returns undefined when the symbol does not exist", () => {
    const index: SymbolIndex = {
      symbolsByFile: {
        "src/order.ts": [],
      },
    };

    expect(findSymbol(index, "src/order.ts", "missing")).toBeUndefined();
  });

  it("finds all symbols with the same name across files", () => {
    const index: SymbolIndex = {
      symbolsByFile: {
        "src/order.ts": [
          {
            name: "createOrder",
            kind: "function",
            filePath: "src/order.ts",
            line: 1,
            exported: true,
          },
        ],
        "src/order-service.ts": [
          {
            name: "createOrder",
            kind: "method",
            filePath: "src/order-service.ts",
            line: 5,
            exported: false,
          },
        ],
        "src/customer.ts": [
          {
            name: "createCustomer",
            kind: "function",
            filePath: "src/customer.ts",
            line: 1,
            exported: true,
          },
        ],
      },
    };

    expect(findSymbolsByName(index, "createOrder")).toEqual([
      {
        name: "createOrder",
        kind: "function",
        filePath: "src/order.ts",
        line: 1,
        exported: true,
      },
      {
        name: "createOrder",
        kind: "method",
        filePath: "src/order-service.ts",
        line: 5,
        exported: false,
      },
    ]);
  });

  it("finds only exported symbols by name", () => {
    const index: SymbolIndex = {
      symbolsByFile: {
        "src/order.ts": [
          {
            name: "createOrder",
            kind: "function",
            filePath: "src/order.ts",
            line: 1,
            exported: true,
          },
        ],
        "src/order-helper.ts": [
          {
            name: "createOrder",
            kind: "function",
            filePath: "src/order-helper.ts",
            line: 1,
            exported: false,
          },
        ],
      },
    };

    expect(findExportedSymbolsByName(index, "createOrder")).toEqual([
      {
        name: "createOrder",
        kind: "function",
        filePath: "src/order.ts",
        line: 1,
        exported: true,
      },
    ]);
  });
});
