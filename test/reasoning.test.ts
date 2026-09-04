import { describe, expect, it } from "vitest";
import {
  normalizeReasoningLevels,
  stepReasoning,
} from "../src/lib/reasoning.js";

describe("reasoning effort", () => {
  it("orders and deduplicates supported levels", () => {
    expect(
      normalizeReasoningLevels(["high", "low", "max", "xhigh", "low"]),
    ).toEqual(["low", "high", "xhigh", "max"]);
  });

  it("steps and clamps at supported boundaries", () => {
    const levels = ["minimal", "low", "medium", "high"];
    expect(stepReasoning("low", 1, levels).level).toBe("medium");
    expect(stepReasoning("minimal", -4, levels).level).toBe("minimal");
    expect(stepReasoning("high", 9, levels).level).toBe("high");
  });
});
