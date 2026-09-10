import { describe, expect, it } from "vitest";

import { detectLanguage } from "../src/repository/language-detector.js";

describe("detectLanguage", () => {
  it("should detect TypeScript", () => {
    expect(detectLanguage(".ts")).toBe("typescript");
    expect(detectLanguage(".tsx")).toBe("typescript");
  });

  it("should detect JavaScript", () => {
    expect(detectLanguage(".js")).toBe("javascript");
    expect(detectLanguage(".jsx")).toBe("javascript");
  });

  it("should detect other supported languages", () => {
    expect(detectLanguage(".py")).toBe("python");
    expect(detectLanguage(".java")).toBe("java");
    expect(detectLanguage(".go")).toBe("go");
    expect(detectLanguage(".rs")).toBe("rust");
    expect(detectLanguage(".php")).toBe("php");
  });

  it("should return unknown for unsupported extensions", () => {
    expect(detectLanguage(".sql")).toBe("unknown");
    expect(detectLanguage(".png")).toBe("unknown");
  });
});
