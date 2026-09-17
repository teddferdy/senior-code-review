import { describe, expect, it } from "vitest";
import { buildCallGraph } from "../src/repository/call-graph.js";

describe("call graph", () => {
  it("builds a direct caller-to-callee edge", () => {
    const sources = {
      "foo.ts": `
export function foo() {}
`,
      "consumer.ts": `
import { foo } from "./foo";

export function consumer() {
  foo();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "foo",
            filePath: "foo.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("builds multiple direct caller-to-callee edges in source order", () => {
    const sources = {
      "helpers.ts": `
export function helper() {}
`,
      "services.ts": `
import { helper } from "./helpers";

export function service() {
  helper();
}
`,
      "main.ts": `
import { service } from "./services";
import { helper } from "./helpers";

export function main() {
  service();
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "service",
            filePath: "services.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helpers.ts",
            line: 2,
          },
          callSite: {
            filePath: "services.ts",
            line: 5,
          },
        },
        {
          caller: {
            symbolName: "main",
            filePath: "main.ts",
            line: 5,
          },
          callee: {
            symbolName: "service",
            filePath: "services.ts",
            line: 4,
          },
          callSite: {
            filePath: "main.ts",
            line: 6,
          },
        },
        {
          caller: {
            symbolName: "main",
            filePath: "main.ts",
            line: 5,
          },
          callee: {
            symbolName: "helper",
            filePath: "helpers.ts",
            line: 2,
          },
          callSite: {
            filePath: "main.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("preserves duplicate direct calls as separate edges", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("tracks the direct call site line", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("tracks the nearest nested function as the caller", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function outer() {
  function inner() {
    helper();
  }

  inner();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "inner",
            filePath: "consumer.ts",
            line: 5,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
        {
          caller: {
            symbolName: "outer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "inner",
            filePath: "consumer.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 9,
          },
        },
      ],
    });
  });

  it("ignores calls that do not resolve to indexed function declarations", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper } from "./helper";

export function consumer() {
  helper();
  console.log("hello");
  Math.max(1, 2);
  unknownFunction();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("tracks a recursive self-call as a self-edge", () => {
    const sources = {
      "factorial.ts": `
export function factorial(n: number) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "factorial",
            filePath: "factorial.ts",
            line: 2,
          },
          callee: {
            symbolName: "factorial",
            filePath: "factorial.ts",
            line: 2,
          },
          callSite: {
            filePath: "factorial.ts",
            line: 4,
          },
        },
      ],
    });
  });

  it("resolves an aliased imported function call", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import { helper as runHelper } from "./helper";

export function consumer() {
  runHelper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a default imported function call", () => {
    const sources = {
      "helper.ts": `
export default function helper() {}
`,
      "consumer.ts": `
import helper from "./helper";

export function consumer() {
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a namespace imported function call", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "consumer.ts": `
import * as helpers from "./helper";

export function consumer() {
  helpers.helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a function through a barrel re-export", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "index.ts": `
export { helper } from "./helper";
`,
      "consumer.ts": `
import { helper } from "./index";

export function consumer() {
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a function through multiple barrel re-exports", () => {
    const sources = {
      "helper.ts": `
export function helper() {}
`,
      "index.ts": `
export { helper } from "./helper";
`,
      "api.ts": `
export { helper } from "./index";
`,
      "consumer.ts": `
import { helper } from "./api";

export function consumer() {
  helper();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "helper",
            filePath: "helper.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a class method call", () => {
    const sources = {
      "service.ts": `
export class Service {
  run() {}
}
`,
      "consumer.ts": `
import { Service } from "./service";

export function consumer() {
  const service = new Service();
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 6,
          },
        },
      ],
    });
  });

  it("resolves an arrow function call", () => {
    const sources = {
      "service.ts": `
export const run = () => {};
`,
      "consumer.ts": `
import { run } from "./service";

export function consumer() {
  run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a function expression call", () => {
    const sources = {
      "service.ts": `
export const run = function () {};
`,
      "consumer.ts": `
import { run } from "./service";

export function consumer() {
  run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 2,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object method call", () => {
    const sources = {
      "service.ts": `
export const service = {
  run() {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object property arrow function call", () => {
    const sources = {
      "service.ts": `
export const service = {
  run: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object property function expression call", () => {
    const sources = {
      "service.ts": `
export const service = {
  run: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object string-literal property arrow function call", () => {
    const sources = {
      "service.ts": `
export const service = {
  "run": () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object string-literal property function expression call", () => {
    const sources = {
      "service.ts": `
export const service = {
  "run": function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service.run();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object numeric-literal property arrow function call", () => {
    const sources = {
      "service.ts": `
export const service = {
  42: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object numeric-literal property function expression call", () => {
    const sources = {
      "service.ts": `
export const service = {
  42: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves an object numeric-literal property through string-literal element access", () => {
    const sources = {
      "service.ts": `
export const service = {
  42: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["42"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed string-literal property arrow function call", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run"]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed string-literal property function expression call", () => {
    const sources = {
      "service.ts": `
export const service = {
  ["run"]: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed numeric-literal property arrow function call", () => {
    const sources = {
      "service.ts": `
export const service = {
  [42]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed numeric-literal property function expression call", () => {
    const sources = {
      "service.ts": `
export const service = {
  [42]: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed identifier property arrow function call", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed identifier property function expression call", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN]: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed identifier numeric property arrow function call", () => {
    const sources = {
      "service.ts": `
const RUN = 42;

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed identifier numeric property function expression call", () => {
    const sources = {
      "service.ts": `
const RUN = 42;

export const service = {
  [RUN]: function () {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[42]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("ignores a computed identifier property when the key is not statically resolvable", () => {
    const sources = {
      "service.ts": `
declare function getKey(): string;

const RUN = getKey();

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service["run"]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("resolves a computed identifier property call using the same identifier", () => {
    const sources = {
      "service.ts": `
const RUN = "run";

export const service = {
  [RUN]: () => {},
};

export function consumer() {
  service[RUN]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "service.ts",
            line: 8,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "service.ts",
            line: 9,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed identifier property call", () => {
    const sources = {
      "service.ts": `
export const RUN = "run";

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service, RUN } from "./service";

export function consumer() {
  service[RUN]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed identifier property call through an aliased key import", () => {
    const sources = {
      "service.ts": `
export const RUN = "run";

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service, RUN as EXECUTE } from "./service";

export function consumer() {
  service[EXECUTE]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed identifier property call through a namespace import", () => {
    const sources = {
      "service.ts": `
export const RUN = "run";

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import * as serviceModule from "./service";

export function consumer() {
  serviceModule.service[serviceModule.RUN]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed template-literal property call", () => {
    const sources = {
      "service.ts": `
export const service = {
  [\`run\`]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[\`run\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 3,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed template-literal property call", () => {
    const sources = {
      "service.ts": `
export const RUN = \`run\`;

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service, RUN } from "./service";

export function consumer() {
  service[RUN]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed template-literal property call", () => {
    const sources = {
      "service.ts": `
export const RUN = \`run\`;

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service, RUN } from "./service";

export function consumer() {
  service[RUN]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed template-expression property with a statically known key", () => {
    const sources = {
      "service.ts": `
const SUFFIX = "n";
const RUN = \`ru\${SUFFIX}\`;

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

export function consumer() {
  service[\`ru\${"n"}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed template-expression property using a statically known identifier", () => {
    const sources = {
      "service.ts": `
const SUFFIX = "n";
const RUN = \`ru\${SUFFIX}\`;

export const service = {
  [RUN]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

const SUFFIX = "n";

export function consumer() {
  service[\`ru\${SUFFIX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 6,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("resolves a computed template-expression property with a statically known numeric key", () => {
    const sources = {
      "service.ts": `
const INDEX = 42;

export const service = {
  [\`\${INDEX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

const INDEX = 42;

export function consumer() {
  service[\`\${INDEX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 6,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 7,
          },
        },
      ],
    });
  });

  it("ignores a computed template-expression property when the key is not statically resolvable", () => {
    const sources = {
      "service.ts": `
const suffix = getSuffix();

export const service = {
  [\`run\${suffix}\`]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

const suffix = getSuffix();

export function consumer() {
  service[\`run\${suffix}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("resolves a cross-file computed template-expression property using a statically known identifier", () => {
    const sources = {
      "service.ts": `
export const SUFFIX = "n";

export const service = {
  [\`ru\${SUFFIX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service, SUFFIX } from "./service";

export function consumer() {
  service[\`ru\${SUFFIX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed template-expression property using a statically known numeric identifier", () => {
    const sources = {
      "service.ts": `
export const INDEX = 42;

export const service = {
  [\`\${INDEX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service, INDEX } from "./service";

export function consumer() {
  service[\`\${INDEX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a cross-file computed template-expression property using an aliased numeric identifier", () => {
    const sources = {
      "service.ts": `
export const INDEX = 42;

export const service = {
  [\`\${INDEX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service, INDEX as SERVICE_INDEX } from "./service";

export function consumer() {
  service[\`\${SERVICE_INDEX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "42",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed template-expression property using a namespace-imported key", () => {
    const sources = {
      "service.ts": `
export const SUFFIX = "n";

export const service = {
  [\`ru\${SUFFIX}\`]: () => {},
};
`,
      "consumer.ts": `
import * as serviceModule from "./service";

export function consumer() {
  serviceModule.service[\`ru\${serviceModule.SUFFIX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "run",
            filePath: "service.ts",
            line: 5,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });

  it("resolves a computed template-expression property with multiple statically known interpolations", () => {
    const sources = {
      "service.ts": `
const PREFIX = "get";
const SUFFIX = "User";

export const service = {
  [\`\${PREFIX}\${SUFFIX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

const PREFIX = "get";
const SUFFIX = "User";

export function consumer() {
  service[\`\${PREFIX}\${SUFFIX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 7,
          },
          callee: {
            symbolName: "getUser",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 8,
          },
        },
      ],
    });
  });

  it("ignores a computed template-expression property when one interpolation is dynamic", () => {
    const sources = {
      "service.ts": `
const PREFIX = "get";
const suffix = getSuffix();

export const service = {
  [\`\${PREFIX}\${suffix}\`]: () => {},
};
`,
      "consumer.ts": `
import { service } from "./service";

const PREFIX = "get";
const suffix = getSuffix();

export function consumer() {
  service[\`\${PREFIX}\${suffix}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [],
    });
  });

  it("resolves a cross-file computed template-expression property with multiple statically known interpolations", () => {
    const sources = {
      "service.ts": `
export const PREFIX = "get";
export const SUFFIX = "User";

export const service = {
  [\`\${PREFIX}\${SUFFIX}\`]: () => {},
};
`,
      "consumer.ts": `
import { service, PREFIX, SUFFIX } from "./service";

export function consumer() {
  service[\`\${PREFIX}\${SUFFIX}\`]();
}
`,
    };

    expect(buildCallGraph(sources)).toEqual({
      edges: [
        {
          caller: {
            symbolName: "consumer",
            filePath: "consumer.ts",
            line: 4,
          },
          callee: {
            symbolName: "getUser",
            filePath: "service.ts",
            line: 6,
          },
          callSite: {
            filePath: "consumer.ts",
            line: 5,
          },
        },
      ],
    });
  });
});
