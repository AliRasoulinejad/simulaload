import { describe, it, expect, vi } from "vitest";
import { CacheComponent } from "./CacheComponent";
import type { LoadSubscriberInterface } from "../interfaces";

function makeSubscriber(): LoadSubscriberInterface {
  return {
    nodeId: "db1",
    type: "database",
    allowedUpstreamTypes: new Set(["cache"]),
    canAcceptUpstream: (type) => type === "cache",
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("CacheComponent", () => {
  it("absorbs hit-ratio load and forwards the miss remainder to the database", () => {
    const cache = new CacheComponent("cache1", { capacity: 100, queueDepth: 0, hitRatio: 0.9 });
    const db = makeSubscriber();
    cache.subscribe(db, { edgeId: "e1", targetId: "db1", weight: 100 });

    cache.onLoadReceived(100, "app1");

    expect(db.onLoadReceived).toHaveBeenCalledWith(10, "cache1");
  });

  it("only accepts an Application as upstream", () => {
    const cache = new CacheComponent("cache1", { capacity: 100, queueDepth: 0, hitRatio: 0.9 });
    expect(cache.canAcceptUpstream("application")).toBe(true);
    expect(cache.canAcceptUpstream("loadBalancer")).toBe(false);
  });
});
