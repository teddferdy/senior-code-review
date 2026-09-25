import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph initializer wrappers", () => {
  it("resolves parenthesized arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (() => {
  helper();
});

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves as-expression arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (() => {
  helper();
}) as () => void;

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves type assertion arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (<() => void>(() => {
  helper();
}));

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves satisfies arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (() => {
  helper();
}) satisfies () => void;

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves non-null arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (() => {
  helper();
})!;

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves interleaved wrappers arrow initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = ((() => {
  helper();
}) as () => void)!;

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves parenthesized function expression initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (function () {
  helper();
});

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves function expression with type assertion initializer caller", () => {
    const sources = {
      "a.ts": `
export const fn = (function () {
  helper();
} as () => void);

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "fn", filePath: "a.ts", line: 2 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 6 },
          callSite: { filePath: "a.ts", line: 3 },
        },
      ],
    });
  });

  it("resolves class property arrow initializer wrapper caller", () => {
    const sources = {
      "a.ts": `
import { helper } from "./helper";

export class Svc {
  run = (() => {
    helper();
  }) as () => void;
}
`,
      "helper.ts": `
export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 5 },
          callee: { symbolName: "helper", filePath: "helper.ts", line: 2 },
          callSite: { filePath: "a.ts", line: 6 },
        },
      ],
    });
  });

  it("resolves cross-file exported wrapped function initializer callee", () => {
    const sources = {
      "a.ts": `
export const helperFn = (() => {}) as () => void;
`,
      "b.ts": `
import { helperFn } from "./a";

export function consume() {
  helperFn();
}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "consume", filePath: "b.ts", line: 4 },
          callee: { symbolName: "helperFn", filePath: "a.ts", line: 2 },
          callSite: { filePath: "b.ts", line: 5 },
        },
      ],
    });
  });
});
