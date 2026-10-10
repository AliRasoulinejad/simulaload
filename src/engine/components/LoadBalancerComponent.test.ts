import { describe, it, expect, vi } from "vitest";
import { LoadBalancerComponent } from "./LoadBalancerComponent";
import type { LoadSubscriberInterface } from "../interfaces";

function makeSubscriber(nodeId: string): LoadSubscriberInterface {
  return {
    nodeId,
    type: "application",
    allowedUpstreamTypes: new Set(["loadBalancer"]),
    canAcceptUpstream: (type) => type === "loadBalancer",
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("LoadBalancerComponent", () => {
  it("splits accepted load by edge weight across two upstreams", () => {
    const lb = new LoadBalancerComponent("lb1", { capacity: 100, queueDepth: 0 });
    const subA = makeSubscriber("subA");
    const subB = makeSubscriber("subB");
    lb.subscribe(subA, { edgeId: "eA", targetId: "subA", weight: 70 });
    lb.subscribe(subB, { edgeId: "eB", targetId: "subB", weight: 30 });

    lb.onLoadReceived(100, "entry1");

    expect(subA.onLoadReceived).toHaveBeenCalledWith(70, "lb1");
    expect(subB.onLoadReceived).toHaveBeenCalledWith(30, "lb1");
  });

  it("drops the overflow beyond its own capacity before splitting the remainder", () => {
    const lb = new LoadBalancerComponent("lb1", { capacity: 50, queueDepth: 0 });
    const subA = makeSubscriber("subA");
    lb.subscribe(subA, { edgeId: "eA", targetId: "subA", weight: 100 });

    lb.onLoadReceived(80, "entry1");

    expect(subA.onLoadReceived).toHaveBeenCalledWith(50, "lb1");
    expect(lb.getSnapshot().droppedThisTick).toBe(30);
  });

  it("setEdgeWeight changes the live split on the next tick", () => {
    const lb = new LoadBalancerComponent("lb1", { capacity: 100, queueDepth: 0 });
    const subA = makeSubscriber("subA");
    const subB = makeSubscriber("subB");
    lb.subscribe(subA, { edgeId: "eA", targetId: "subA", weight: 50 });
    lb.subscribe(subB, { edgeId: "eB", targetId: "subB", weight: 50 });

    lb.setEdgeWeight("eA", 90);
    lb.setEdgeWeight("eB", 10);
    lb.onLoadReceived(100, "entry1");

    expect(subA.onLoadReceived).toHaveBeenCalledWith(90, "lb1");
    expect(subB.onLoadReceived).toHaveBeenCalledWith(10, "lb1");
  });
});
