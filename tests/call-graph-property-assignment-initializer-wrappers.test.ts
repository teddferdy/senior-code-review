import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph";

describe("call graph property assignment initializer wrappers", () => {
  it("resolves parenthesized arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run: (() => {
    helper();
  })
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 8 },
          callSite: { filePath: "a.ts", line: 4 },
        },
      ],
    });
  });

  it("resolves as-expression arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (() => {
      helper();
    }) as () => void
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves type assertion arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (<() => void>(() => {
      helper();
    }))
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves satisfies arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (() => {
      helper();
    }) satisfies () => void
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves non-null arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (() => {
      helper();
    })!
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves interleaved wrappers arrow initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    ((() => {
      helper();
    }) as () => void)!
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves parenthesized function expression initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (function () {
      helper();
    })
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves function expression with as initializer", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (function () {
      helper();
    } as () => void)
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves computed-name wrapper plus initializer wrapper", () => {
    const sources = {
      "a.ts": `
export const obj = {
  ["run" as const]:
    (() => {
      helper();
    }) as () => void
};

export function helper() {}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "run", filePath: "a.ts", line: 3 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 9 },
          callSite: { filePath: "a.ts", line: 5 },
        },
      ],
    });
  });

  it("resolves cross-file wrapped property assignment", () => {
    const sources = {
      "a.ts": `
export const obj = {
  run:
    (() => {}) as () => void
};
`,
      "b.ts": `
import { obj } from "./a";

export function consume() {
  obj.run();
}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "consume", filePath: "b.ts", line: 4 },
          callee: { symbolName: "run", filePath: "a.ts", line: 3 },
          callSite: { filePath: "b.ts", line: 5 },
        },
      ],
    });
  });

  it("does not resolve alias helper as initializer", () => {
    const sources = {
      "a.ts": `
export function helper() {}
export const obj = {
  run: helper
};
export function caller() {
  helper();
}
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: { symbolName: "caller", filePath: "a.ts", line: 6 },
          callee: { symbolName: "helper", filePath: "a.ts", line: 2 },
          callSite: { filePath: "a.ts", line: 7 },
        },
      ],
    });
  });

  it("does not resolve getFn() initializer", () => {
    const sources = {
      "a.ts": `
export function helper() {}
export function getFn(): () => void { return () => {}; }
export const obj = {
  run: getFn()
};
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("does not resolve conditional initializer", () => {
    const sources = {
      "a.ts": `
declare const cond: boolean;
export function helper() {}
export const obj = {
  run: cond ? (() => { helper(); }) : (() => {})
};
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("does not resolve dynamic computed key", () => {
    const sources = {
      "a.ts": `
declare function getKey(): string;
export function helper() {}
export const obj = {
  [getKey()]: () => {
    helper();
  }
};
`,
    };
    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });
});
