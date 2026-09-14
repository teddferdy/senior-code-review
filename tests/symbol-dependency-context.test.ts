import { describe, expect, it } from "vitest";

import {
  getSymbolDependents,
  getSymbolDependencyContext,
} from "../src/repository/symbol-dependency-context.js";
import type { DependencyGraph } from "../src/repository/dependency-graph.js";
import type { RepositorySymbol } from "../src/repository/symbols.js";

describe("getSymbolDependents", () => {
  it("returns files that depend on the symbol's file", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": [],
        "src/checkout.ts": ["src/order.ts"],
        "src/payment.ts": ["src/order.ts"],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
        "src/checkout.ts": [],
        "src/payment.ts": [],
      },
      cycles: [],
    };

    expect(getSymbolDependents(symbol, dependencyGraph)).toEqual([
      "src/checkout.ts",
      "src/payment.ts",
    ]);
  });

  it("returns an empty array when nothing depends on the symbol's file", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": [],
      },
      dependents: {
        "src/order.ts": [],
      },
      cycles: [],
    };

    expect(getSymbolDependents(symbol, dependencyGraph)).toEqual([]);
  });
});

describe("getSymbolDependencyContext", () => {
  it("returns the symbol's containing file path", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
      },
      cycles: [],
    };

    const result = getSymbolDependencyContext(symbol, dependencyGraph);

    expect(result.filePath).toBe("src/order.ts");
  });

  it("returns direct dependencies of the symbol's containing file", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
        "src/checkout.ts": ["src/order.ts"],
        "src/payment.ts": ["src/order.ts"],
        "src/db.ts": [],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
        "src/db.ts": ["src/order.ts"],
        "src/checkout.ts": [],
        "src/payment.ts": [],
      },
      cycles: [],
    };

    const result = getSymbolDependencyContext(symbol, dependencyGraph);

    expect(result.dependencies).toEqual(["src/db.ts"]);
  });

  it("returns direct dependents of the symbol's containing file", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
        "src/checkout.ts": ["src/order.ts"],
        "src/payment.ts": ["src/order.ts"],
        "src/db.ts": [],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
        "src/db.ts": ["src/order.ts"],
        "src/checkout.ts": [],
        "src/payment.ts": [],
      },
      cycles: [],
    };

    const result = getSymbolDependencyContext(symbol, dependencyGraph);

    expect(result.dependents).toEqual(["src/checkout.ts", "src/payment.ts"]);
  });

  it("returns empty arrays when the file has no dependencies or dependents", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": [],
      },
      dependents: {
        "src/order.ts": [],
      },
      cycles: [],
    };

    const result = getSymbolDependencyContext(symbol, dependencyGraph);

    expect(result).toEqual({
      filePath: "src/order.ts",
      dependencies: [],
      dependents: [],
    });
  });

  it("returns full dependency context for a symbol's file (integration example)", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 10,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
        "src/checkout.ts": ["src/order.ts"],
        "src/payment.ts": ["src/order.ts"],
        "src/db.ts": [],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
        "src/db.ts": ["src/order.ts"],
        "src/checkout.ts": [],
        "src/payment.ts": [],
      },
      cycles: [],
    };

    expect(getSymbolDependencyContext(symbol, dependencyGraph)).toEqual({
      filePath: "src/order.ts",
      dependencies: ["src/db.ts"],
      dependents: ["src/checkout.ts", "src/payment.ts"],
    });
  });
});

describe("getSymbolDependencyContext edge cases", () => {
  it("returns empty arrays when symbol file is missing from dependency graph", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {},
      dependents: {},
      cycles: [],
    };

    expect(getSymbolDependencyContext(symbol, dependencyGraph)).toEqual({
      filePath: "src/order.ts",
      dependencies: [],
      dependents: [],
    });
  });

  it("returns dependencies when dependents entry is missing", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
      },
      dependents: {},
      cycles: [],
    };

    expect(getSymbolDependencyContext(symbol, dependencyGraph)).toEqual({
      filePath: "src/order.ts",
      dependencies: ["src/db.ts"],
      dependents: [],
    });
  });

  it("returns dependents when dependencies entry is missing", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {},
      dependents: {
        "src/order.ts": ["src/checkout.ts", "src/payment.ts"],
      },
      cycles: [],
    };

    expect(getSymbolDependencyContext(symbol, dependencyGraph)).toEqual({
      filePath: "src/order.ts",
      dependencies: [],
      dependents: ["src/checkout.ts", "src/payment.ts"],
    });
  });

  it("preserves existing ordering of dependencies and dependents", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/z.ts", "src/a.ts"],
      },
      dependents: {
        "src/order.ts": ["src/z.ts", "src/a.ts"],
      },
      cycles: [],
    };

    const result = getSymbolDependencyContext(symbol, dependencyGraph);

    expect(result).toEqual({
      filePath: "src/order.ts",
      dependencies: ["src/z.ts", "src/a.ts"],
      dependents: ["src/z.ts", "src/a.ts"],
    });
    // Explicit ordering check: must not be sorted
    expect(result.dependencies).toEqual(["src/z.ts", "src/a.ts"]);
    expect(result.dependents).toEqual(["src/z.ts", "src/a.ts"]);
  });
});

describe("getSymbolDependencyContext immutability", () => {
  it("calling the helper does not mutate the graph", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts"],
      },
      cycles: [],
    };

    const dependenciesSnapshot = [...dependencyGraph.dependencies["src/order.ts"]];
    const dependentsSnapshot = [...dependencyGraph.dependents["src/order.ts"]];
    const dependenciesSnapshotFull = JSON.parse(
      JSON.stringify(dependencyGraph.dependencies),
    );
    const dependentsSnapshotFull = JSON.parse(
      JSON.stringify(dependencyGraph.dependents),
    );

    getSymbolDependencyContext(symbol, dependencyGraph);

    expect(dependencyGraph.dependencies).toEqual(dependenciesSnapshotFull);
    expect(dependencyGraph.dependents).toEqual(dependentsSnapshotFull);
    expect(dependencyGraph.dependencies["src/order.ts"]).toEqual(["src/db.ts"]);
    expect(dependencyGraph.dependents["src/order.ts"]).toEqual([
      "src/checkout.ts",
    ]);
    // Also ensure nested arrays unchanged via snapshot
    expect(dependencyGraph.dependencies["src/order.ts"]).toEqual(
      dependenciesSnapshot,
    );
    expect(dependencyGraph.dependents["src/order.ts"]).toEqual(
      dependentsSnapshot,
    );
  });

  it("mutating returned arrays does not mutate the graph", () => {
    const symbol: RepositorySymbol = {
      name: "createOrder",
      kind: "function",
      filePath: "src/order.ts",
      line: 1,
      exported: true,
    };

    const dependencyGraph: DependencyGraph = {
      dependencies: {
        "src/order.ts": ["src/db.ts"],
      },
      dependents: {
        "src/order.ts": ["src/checkout.ts"],
      },
      cycles: [],
    };

    const context = getSymbolDependencyContext(symbol, dependencyGraph);

    context.dependencies.push("src/another.ts");
    context.dependents.push("src/refund.ts");

    expect(dependencyGraph.dependencies["src/order.ts"]).toEqual(["src/db.ts"]);
    expect(dependencyGraph.dependents["src/order.ts"]).toEqual([
      "src/checkout.ts",
    ]);
  });
});
