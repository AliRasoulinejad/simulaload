import { describe, it, expect } from "vitest";
import { DEFAULT_TICK_SECONDS } from "./constants";

describe("constants", () => {
  it("fixes the tick rate at 0.25 seconds", () => {
    expect(DEFAULT_TICK_SECONDS).toBe(0.25);
  });
});
