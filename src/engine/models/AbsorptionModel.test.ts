import { describe, it, expect } from "vitest";
import { AbsorptionModel } from "./AbsorptionModel";

describe("AbsorptionModel", () => {
  it("absorbs the configured ratio and forwards the remainder", () => {
    const model = new AbsorptionModel(0.7);
    expect(model.absorb(10)).toEqual({ absorbed: 7, remainder: 3 });
  });

  it("forwards everything when the ratio is zero", () => {
    const model = new AbsorptionModel(0);
    expect(model.absorb(10)).toEqual({ absorbed: 0, remainder: 10 });
  });

  it("absorbs everything when the ratio is one", () => {
    const model = new AbsorptionModel(1);
    expect(model.absorb(10)).toEqual({ absorbed: 10, remainder: 0 });
  });

  it("allows the ratio to be changed live via the mutable field", () => {
    const model = new AbsorptionModel(0.5);
    model.absorptionRatio = 0.9;
    expect(model.absorb(10)).toEqual({ absorbed: 9, remainder: 1 });
  });
});
