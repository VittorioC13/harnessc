import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callJsonModel, estimateCostUsd, getModel, MissingApiKeyError } from "../src/lib/llm.js";

describe("estimateCostUsd", () => {
  it("computes cost from DeepSeek's published per-token rates", () => {
    const cost = estimateCostUsd({ promptTokens: 1_000_000, completionTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.14 + 0.28, 5);
  });

  it("returns 0 for zero usage", () => {
    expect(estimateCostUsd({ promptTokens: 0, completionTokens: 0 })).toBe(0);
  });
});

describe("getModel", () => {
  const original = process.env.HARNESSC_MODEL;

  afterEach(() => {
    if (original === undefined) delete process.env.HARNESSC_MODEL;
    else process.env.HARNESSC_MODEL = original;
  });

  it("defaults to deepseek-v4-flash when HARNESSC_MODEL is unset", () => {
    delete process.env.HARNESSC_MODEL;
    expect(getModel()).toBe("deepseek-v4-flash");
  });

  it("respects the HARNESSC_MODEL override", () => {
    process.env.HARNESSC_MODEL = "deepseek-v4-pro";
    expect(getModel()).toBe("deepseek-v4-pro");
  });
});

describe("callJsonModel without an API key", () => {
  const original = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original;
  });

  it("throws MissingApiKeyError before making any network call", async () => {
    await expect(callJsonModel("system", "user")).rejects.toBeInstanceOf(MissingApiKeyError);
  });
});
