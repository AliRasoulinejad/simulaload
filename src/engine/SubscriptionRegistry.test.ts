import { describe, it, expect, vi } from "vitest";
import { SubscriptionRegistry } from "./SubscriptionRegistry";
import type { LoadSubscriberInterface } from "./interfaces";
import { SingleForwardStrategy } from "./strategies/SingleForwardStrategy";
import { WeightedSplitStrategy } from "./strategies/WeightedSplitStrategy";

function makeSubscriber(nodeId: string, allowed: Set<string>): LoadSubscriberInterface {
  return {
    nodeId,
    type: "database",
    allowedUpstreamTypes: allowed as ReadonlySet<any>,
    canAcceptUpstream: (type) => allowed.has(type),
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("SubscriptionRegistry", () => {
  it("rejects subscribing a node that does not accept this publisher type", () => {
    const registry = new SubscriptionRegistry("pub1", "cdn");
    const subscriber = makeSubscriber("sub1", new Set(["entryPoint"]));
    expect(() => registry.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 })).toThrow();
  });

  it("registers the upstream count on the subscriber when subscribing", () => {
    const registry = new SubscriptionRegistry("pub1", "cdn");
    const subscriber = makeSubscriber("sub1", new Set(["cdn"]));
    registry.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });
    expect(subscriber.registerUpstream).toHaveBeenCalledWith("pub1");
  });

  it("dispatches load to subscribers via the given strategy and records the last dispatch", () => {
    const registry = new SubscriptionRegistry("pub1", "cdn");
    const subscriber = makeSubscriber("sub1", new Set(["cdn"]));
    registry.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });
    registry.dispatch(40, new SingleForwardStrategy());
    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(40, "pub1");
    expect(registry.getLastDispatch().get("e1")).toBe(40);
  });

  it("stops notifying a subscriber after unsubscribe, and decrements its upstream count", () => {
    const registry = new SubscriptionRegistry("pub1", "cdn");
    const subscriber = makeSubscriber("sub1", new Set(["cdn"]));
    registry.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });
    registry.unsubscribe("sub1");
    expect(subscriber.unregisterUpstream).toHaveBeenCalledWith("pub1");
    registry.dispatch(40, new SingleForwardStrategy());
    expect(subscriber.onLoadReceived).not.toHaveBeenCalled();
  });

  it("updateEdgeWeight mutates the live edge weight used by subsequent dispatches", () => {
    const registry = new SubscriptionRegistry("pub1", "loadBalancer");
    const subA = makeSubscriber("subA", new Set(["loadBalancer"]));
    const subB = makeSubscriber("subB", new Set(["loadBalancer"]));
    registry.subscribe(subA, { edgeId: "eA", targetId: "subA", weight: 50 });
    registry.subscribe(subB, { edgeId: "eB", targetId: "subB", weight: 50 });
    registry.updateEdgeWeight("eA", 90);
    registry.updateEdgeWeight("eB", 10);
    registry.dispatch(100, new WeightedSplitStrategy());
    expect(subA.onLoadReceived).toHaveBeenCalledWith(90, "pub1");
    expect(subB.onLoadReceived).toHaveBeenCalledWith(10, "pub1");
  });
});
