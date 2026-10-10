import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EntryPointComponent } from "./EntryPointComponent";
import type { LoadSubscriberInterface } from "../interfaces";

function makeSubscriber(): LoadSubscriberInterface {
  return {
    nodeId: "sub1",
    type: "cdn",
    allowedUpstreamTypes: new Set(["entryPoint"]),
    canAcceptUpstream: (type) => type === "entryPoint",
    registerUpstream: vi.fn(),
    unregisterUpstream: vi.fn(),
    onLoadReceived: vi.fn(),
  };
}

describe("EntryPointComponent", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dispatches targetRps to its subscriber on each manual tick", () => {
    const entryPoint = new EntryPointComponent("entry1", { targetRps: 50 });
    const subscriber = makeSubscriber();
    entryPoint.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });

    entryPoint.tick();

    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(50, "entry1");
    expect(entryPoint.getSnapshot().currentRps).toBe(50);
  });

  it("reflects a live setConfig change on the very next tick", () => {
    const entryPoint = new EntryPointComponent("entry1", { targetRps: 50 });
    const subscriber = makeSubscriber();
    entryPoint.subscribe(subscriber, { edgeId: "e1", targetId: "sub1", weight: 100 });

    entryPoint.setConfig({ targetRps: 0 });
    entryPoint.tick();

    expect(subscriber.onLoadReceived).toHaveBeenCalledWith(0, "entry1");
    expect(entryPoint.getSnapshot().utilization).toBe(0);
  });

  it("clamps a negative targetRps to zero", () => {
    const entryPoint = new EntryPointComponent("entry1", { targetRps: 50 });
    entryPoint.setConfig({ targetRps: -10 });
    expect(entryPoint.getConfig().targetRps).toBe(0);
  });

  it("startClock ticks repeatedly and invokes the onTick callback", () => {
    const entryPoint = new EntryPointComponent("entry1", { targetRps: 20 });
    const onTick = vi.fn();
    entryPoint.startClock(0.25, onTick);

    vi.advanceTimersByTime(1000); // 4 ticks at 250ms

    expect(onTick).toHaveBeenCalledTimes(4);
    entryPoint.stopClock();
  });

  it("stopClock halts further ticking", () => {
    const entryPoint = new EntryPointComponent("entry1", { targetRps: 20 });
    const onTick = vi.fn();
    entryPoint.startClock(0.25, onTick);
    entryPoint.stopClock();

    vi.advanceTimersByTime(1000);

    expect(onTick).not.toHaveBeenCalled();
  });
});
