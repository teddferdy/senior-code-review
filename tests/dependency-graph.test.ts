import { describe, expect, it } from "vitest";
import { buildDependencyGraph } from "../src/repository/dependency-graph.js";

describe("Dependency Graph", () => {
  it("should resolve imports into repository file dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
          import { createOrder } from "../services/order-service";
        `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependencies["src/controllers/order-controller.ts"]).toEqual([
      "src/services/order-service.ts",
    ]);
  });

  it("should ignore imports that cannot be resolved", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
        import { createOrder } from "../services/order-service";
        import { missing } from "../services/missing-service";
      `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependencies["src/controllers/order-controller.ts"]).toEqual([
      "src/services/order-service.ts",
    ]);
  });

  it("should deduplicate repeated dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
        import { createOrder } from "../services/order-service";
        import { updateOrder } from "../services/order-service";
      `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependencies["src/controllers/order-controller.ts"]).toEqual([
      "src/services/order-service.ts",
    ]);
  });

  it("should include source files with no dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
        import { createOrder } from "../services/order-service";
      `,
        "src/services/order-service.ts": `
        export function createOrder() {}
      `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependencies["src/services/order-service.ts"]).toEqual([]);
  });

  it("should build reverse dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
        import { createOrder } from "../services/order-service";
      `,
        "src/services/order-service.ts": `
        export function createOrder() {}
      `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependents["src/services/order-service.ts"]).toEqual([
      "src/controllers/order-controller.ts",
    ]);
  });

  it("should include source files with no dependents", () => {
    const graph = buildDependencyGraph(
      {
        "src/controllers/order-controller.ts": `
        import { createOrder } from "../services/order-service";
      `,
        "src/services/order-service.ts": `
        export function createOrder() {}
      `,
      },
      ["src/controllers/order-controller.ts", "src/services/order-service.ts"],
    );

    expect(graph.dependents["src/controllers/order-controller.ts"]).toEqual([]);
  });

  it("should include repository files with no source content", () => {
    const graph = buildDependencyGraph(
      {
        "src/services/order-service.ts": `
        export function createOrder() {}
      `,
      },
      ["src/services/order-service.ts", "src/utils/date.ts"],
    );

    expect(graph.dependencies["src/utils/date.ts"]).toEqual([]);
    expect(graph.dependents["src/utils/date.ts"]).toEqual([]);
  });

  it("should return dependencies and dependents in deterministic order", () => {
    const graph = buildDependencyGraph(
      {
        "src/a.ts": `
        import "./c";
        import "./b";
      `,
        "src/b.ts": "",
        "src/c.ts": "",
      },
      ["src/c.ts", "src/a.ts", "src/b.ts"],
    );

    expect(graph.dependencies["src/a.ts"]).toEqual(["src/b.ts", "src/c.ts"]);

    expect(graph.dependents["src/b.ts"]).toEqual(["src/a.ts"]);

    expect(graph.dependents["src/c.ts"]).toEqual(["src/a.ts"]);
  });

  it("should ignore self-imports", () => {
    const graph = buildDependencyGraph(
      {
        "src/a.ts": `
        import "./a";
      `,
      },
      ["src/a.ts"],
    );

    expect(graph.dependencies["src/a.ts"]).toEqual([]);
    expect(graph.dependents["src/a.ts"]).toEqual([]);
  });

  it("should detect circular dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/a.ts": `
        import "./b";
      `,
        "src/b.ts": `
        import "./a";
      `,
      },
      ["src/a.ts", "src/b.ts"],
    );

    expect(graph.cycles).toEqual([["src/a.ts", "src/b.ts", "src/a.ts"]]);
  });

  it("should detect multiple independent circular dependencies", () => {
    const graph = buildDependencyGraph(
      {
        "src/a.ts": `
        import "./b";
      `,
        "src/b.ts": `
        import "./a";
      `,
        "src/c.ts": `
        import "./d";
      `,
        "src/d.ts": `
        import "./c";
      `,
      },
      ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
    );

    expect(graph.cycles).toEqual([
      ["src/a.ts", "src/b.ts", "src/a.ts"],
      ["src/c.ts", "src/d.ts", "src/c.ts"],
    ]);
  });

  it("should detect circular dependencies across multiple files", () => {
    const graph = buildDependencyGraph(
      {
        "src/a.ts": `
        import "./b";
      `,
        "src/b.ts": `
        import "./c";
      `,
        "src/c.ts": `
        import "./a";
      `,
      },
      ["src/a.ts", "src/b.ts", "src/c.ts"],
    );

    expect(graph.cycles).toEqual([
      ["src/a.ts", "src/b.ts", "src/c.ts", "src/a.ts"],
    ]);
  });
});
