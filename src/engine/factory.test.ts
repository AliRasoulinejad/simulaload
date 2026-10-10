import { describe, it, expect } from "vitest";
import { createComponent } from "./factory";
import { CdnComponent } from "./components/CdnComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";

describe("createComponent", () => {
  it("creates a component of the requested type with sensible defaults", () => {
    const cdn = createComponent("cdn", "cdn1");
    expect(cdn).toBeInstanceOf(CdnComponent);
    expect(cdn.getConfig()).toMatchObject({ capacity: 100, cacheHitRatio: 0.7 });
  });

  it("applies config overrides on top of the defaults", () => {
    const db = createComponent("database", "db1", { capacity: 500 });
    expect(db).toBeInstanceOf(DatabaseComponent);
    expect((db as DatabaseComponent).getConfig().capacity).toBe(500);
  });
});
