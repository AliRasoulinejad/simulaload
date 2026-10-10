import { describe, it, expect, vi } from "vitest";
import { CdnComponent } from "./CdnComponent";
import type { LoadSubscriberInterface } from "../interfaces";

function makeSubscriber(): LoadSubscriberInterface {
  return {
    nodeId: "sub1",
    type: "application",
    allowedUpstreamTypes: new Set(["cdn"]),
    canAcceptUpstream: (type) => type === "cdn",
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("CdnComponent", () => {
  it("absorbs the hit ratio and forwards only the miss remainder", () => {
    const cdn = new CdnComponent("cdn1", { capacity: 100, queueDepth: 0, cacheHitRatio: 0.8 });
    const subscriber = makeSubscriber();
    cdn.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });

    cdn.onLoadReceived(50, "entry1");

    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(10, "cdn1");
  });

  it("drops the portion beyond capacity before absorption is applied", () => {
    const cdn = new CdnComponent("cdn1", { capacity: 20, queueDepth: 0, cacheHitRatio: 0.5 });
    const subscriber = makeSubscriber();
    cdn.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });

    cdn.onLoadReceived(50, "entry1");

    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(10, "cdn1"); // 20 accepted, 50% absorbed
    expect(cdn.getSnapshot().droppedThisTick).toBe(30);
  });

  it("setConfig updates capacity and hit ratio live", () => {
    const cdn = new CdnComponent("cdn1", { capacity: 100, queueDepth: 0, cacheHitRatio: 0.5 });
    cdn.setConfig({ cacheHitRatio: 1 });
    const subscriber = makeSubscriber();
    cdn.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });

    cdn.onLoadReceived(10, "entry1");

    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(0, "cdn1");
  });
});
