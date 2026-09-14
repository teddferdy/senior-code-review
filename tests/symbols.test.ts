import { describe, expect, it } from "vitest";

import { analyzeSymbols } from "../src/repository/symbol-analyzer.js";

describe("RepositorySymbol", () => {
  it("detects a function declaration", () => {
    const symbols = analyzeSymbols("function createOrder() {}", "src/order.ts");

    expect(symbols).toEqual([
      {
        name: "createOrder",
        kind: "function",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects an exported function declaration", () => {
    const symbols = analyzeSymbols(
      "export function createOrder() {}",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "createOrder",
        kind: "function",
        filePath: "src/order.ts",
        line: 1,
        exported: true,
      },
    ]);
  });

  it("detects a class declaration", () => {
    const symbols = analyzeSymbols(
      "class OrderService {}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects an exported class declaration", () => {
    const symbols = analyzeSymbols(
      "export class OrderService {}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: true,
      },
    ]);
  });

  it("detects a class method", () => {
    const symbols = analyzeSymbols(
      "class OrderService {\n  createOrder() {}\n}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: false,
      },
      {
        name: "createOrder",
        kind: "method",
        filePath: "src/order-service.ts",
        line: 2,
        exported: false,
      },
    ]);
  });

  it("detects a const variable", () => {
    const symbols = analyzeSymbols(
      "const orderService = createOrderService();",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "orderService",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects an exported const variable", () => {
    const symbols = analyzeSymbols(
      "export const orderService = createOrderService();",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "orderService",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: true,
      },
    ]);
  });

  it("detects multiple variables in one declaration", () => {
    const symbols = analyzeSymbols(
      "const orderService = createOrderService(), orderRepository = createOrderRepository();",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "orderService",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
      {
        name: "orderRepository",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects let and var variables", () => {
    const symbols = analyzeSymbols(
      "let orderCount = 0;\nvar legacyOrder = true;",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "orderCount",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
      {
        name: "legacyOrder",
        kind: "variable",
        filePath: "src/order.ts",
        line: 2,
        exported: false,
      },
    ]);
  });

  it("ignores destructuring variable declarations", () => {
    const symbols = analyzeSymbols(
      "const { orderId, storeId } = order;",
      "src/order.ts",
    );

    expect(symbols).toEqual([]);
  });

  it("detects an arrow function assigned to a variable", () => {
    const symbols = analyzeSymbols(
      "const createOrder = () => {};",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "createOrder",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects a function expression assigned to a variable", () => {
    const symbols = analyzeSymbols(
      "const createOrder = function () {};",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "createOrder",
        kind: "variable",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("detects a static class method", () => {
    const symbols = analyzeSymbols(
      "class OrderService {\n  static createOrder() {}\n}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: false,
      },
      {
        name: "createOrder",
        kind: "method",
        filePath: "src/order-service.ts",
        line: 2,
        exported: false,
      },
    ]);
  });

  it("detects a static method inside an exported class", () => {
    const symbols = analyzeSymbols(
      "export class OrderService {\n  static createOrder() {}\n}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: true,
      },
      {
        name: "createOrder",
        kind: "method",
        filePath: "src/order-service.ts",
        line: 2,
        exported: false,
      },
    ]);
  });

  it("ignores getter and setter accessors", () => {
    const symbols = analyzeSymbols(
      "class Order {\n  get total() { return 0; }\n  set total(value) {}\n}",
      "src/order.ts",
    );

    expect(symbols).toEqual([
      {
        name: "Order",
        kind: "class",
        filePath: "src/order.ts",
        line: 1,
        exported: false,
      },
    ]);
  });

  it("ignores class constructors", () => {
    const symbols = analyzeSymbols(
      "class OrderService {\n  constructor() {}\n}",
      "src/order-service.ts",
    );

    expect(symbols).toEqual([
      {
        name: "OrderService",
        kind: "class",
        filePath: "src/order-service.ts",
        line: 1,
        exported: false,
      },
    ]);
  });
});
