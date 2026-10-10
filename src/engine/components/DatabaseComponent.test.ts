import { describe, it, expect } from "vitest";
import { DatabaseComponent } from "./DatabaseComponent";

describe("DatabaseComponent", () => {
  it("accepts load up to capacity and reports it in the snapshot, with no outgoing edges", () => {
    const db = new DatabaseComponent("db1", { capacity: 30, queueDepth: 5 });

    db.onLoadReceived(20, "app1");

    expect(db.getSnapshot().currentRps).toBe(20);
    expect((db as unknown as { subscribe?: unknown }).subscribe).toBeUndefined();
  });

  it("queues and drops overflow beyond capacity and queueDepth", () => {
    const db = new DatabaseComponent("db1", { capacity: 10, queueDepth: 2 });

    db.onLoadReceived(30, "app1");

    const snapshot = db.getSnapshot();
    expect(snapshot.currentRps).toBe(10);
    expect(snapshot.queueLength).toBe(2);
    expect(snapshot.droppedThisTick).toBe(12);
  });

  it("accepts both Application and Cache as upstream", () => {
    const db = new DatabaseComponent("db1", { capacity: 10, queueDepth: 2 });
    expect(db.canAcceptUpstream("application")).toBe(true);
    expect(db.canAcceptUpstream("cache")).toBe(true);
    expect(db.canAcceptUpstream("cdn")).toBe(false);
  });
});
