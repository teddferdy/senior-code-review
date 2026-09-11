import { describe, expect, it } from "vitest";
import { buildImportMap } from "../src/repository/import-map.js";

describe("Import Map", () => {
  it("should map imported modules for a source file", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import { createOrder } from "./services/order-service.js";
      import { logger } from "./utils/logger.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": ["./services/order-service.js", "./utils/logger.js"],
      },
    });
  });

  it("should map imports for multiple source files", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import { createOrder } from "./services/order-service.js";
    `,
      "src/services/order-service.ts": `
      import { repository } from "./repositories/order-repository.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": ["./services/order-service.js"],
        "src/services/order-service.ts": ["./repositories/order-repository.js"],
      },
    });
  });

  it("should extract imports from source code", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import { createOrder } from "./services/order-service.js";
      import { logger } from "./utils/logger.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": ["./services/order-service.js", "./utils/logger.js"],
      },
    });
  });

  it("should extract side-effect imports", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import "./config.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": ["./config.js"],
      },
    });
  });

  it("should extract type imports", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import type { Order } from "./types/order.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": ["./types/order.js"],
      },
    });
  });

  it("should preserve duplicate imports", () => {
    const map = buildImportMap({
      "src/app.ts": `
      import { createOrder } from "./services/order-service.js";
      import { createOrder as createOrderAgain } from "./services/order-service.js";
    `,
    });

    expect(map).toEqual({
      imports: {
        "src/app.ts": [
          "./services/order-service.js",
          "./services/order-service.js",
        ],
      },
    });
  });
});
