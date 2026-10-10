import { describe, it, expect } from "vitest";
import { CapacityModel } from "./CapacityModel";

describe("CapacityModel", () => {
  it("accepts everything when under capacity", () => {
    const model = new CapacityModel(10, 5);
    const result = model.accept(6, 1);
    expect(result).toEqual({ accepted: 6, queued: 0, dropped: 0 });
  });

  it("queues the overflow up to queueDepth, then drops the rest", () => {
    const model = new CapacityModel(10, 3);
    const result = model.accept(15, 1);
    expect(result).toEqual({ accepted: 10, queued: 3, dropped: 2 });
  });

  it("drains a previously queued backlog on the next tick", () => {
    const model = new CapacityModel(10, 3);
    model.accept(15, 1); // queue = 3
    const result = model.accept(5, 1); // total pending = 5 + 3 = 8, capacity 10
    expect(result).toEqual({ accepted: 8, queued: 0, dropped: 0 });
    expect(model.currentQueue).toBe(0);
  });

  it("drops everything when capacity is zero, without producing NaN", () => {
    const model = new CapacityModel(0, 0);
    const result = model.accept(5, 1);
    expect(result).toEqual({ accepted: 0, queued: 0, dropped: 5 });
    expect(Number.isNaN(result.accepted)).toBe(false);
  });

  it("scales by deltaSeconds smaller than one second", () => {
    const model = new CapacityModel(10, 0);
    // over 0.25s, capacity allows 2.5 request-units through
    const result = model.accept(10, 0.25);
    expect(result.accepted).toBeCloseTo(10, 5);
    expect(result.dropped).toBeCloseTo(0, 5);
  });
});
