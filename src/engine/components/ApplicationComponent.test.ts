import { describe, it, expect, vi } from "vitest";
import { ApplicationComponent } from "./ApplicationComponent";
import type { LoadSubscriberInterface } from "../interfaces";

function makeSubscriber(nodeId: string): LoadSubscriberInterface {
  return {
    nodeId,
    type: "database",
    allowedUpstreamTypes: new Set(["application"]),
    canAcceptUpstream: (type) => type === "application",
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("ApplicationComponent", () => {
  it("broadcasts the full accepted load to every downstream dependency", () => {
    const app = new ApplicationComponent("app1", { capacity: 100, queueDepth: 0 });
    const cache = makeSubscriber("cache1");
    const db = makeSubscriber("db1");
    app.subscribe(cache, { edgeId: "eCache", targetId: "cache1", weight: 0 });
    app.subscribe(db, { edgeId: "eDb", targetId: "db1", weight: 0 });

    app.onLoadReceived(60, "lb1");

    expect(cache.onLoadReceived).toHaveBeenCalledWith(60, "app1");
    expect(db.onLoadReceived).toHaveBeenCalledWith(60, "app1");
  });

  it("broadcasts the capacity-limited amount, not the raw incoming amount", () => {
    const app = new ApplicationComponent("app1", { capacity: 40, queueDepth: 0 });
    const cache = makeSubscriber("cache1");
    app.subscribe(cache, { edgeId: "eCache", targetId: "cache1", weight: 0 });

    app.onLoadReceived(60, "lb1");

    expect(cache.onLoadReceived).toHaveBeenCalledWith(40, "app1");
    expect(app.getSnapshot().droppedThisTick).toBe(20);
  });
});
