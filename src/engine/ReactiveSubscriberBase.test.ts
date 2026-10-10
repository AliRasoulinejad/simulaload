import { describe, it, expect, vi } from "vitest";
import { ReactiveSubscriberBase } from "./ReactiveSubscriberBase";
import { CapacityModel } from "./models/CapacityModel";
import type { ComponentType } from "./types";

class TestComponent extends ReactiveSubscriberBase {
  readonly nodeId = "test1";
  readonly type: ComponentType = "application";
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint"]);
  onFlushSpy = vi.fn();
  protected onFlush(outgoing: number): void {
    this.onFlushSpy(outgoing);
  }
}

describe("ReactiveSubscriberBase", () => {
  it("flushes immediately when it has no registered upstreams (treats arrival count as 1)", () => {
    const component = new TestComponent(new CapacityModel(100, 0));
    component.onLoadReceived(10, "upstream1");
    expect(component.onFlushSpy).toHaveBeenCalledWith(10);
  });

  it("waits for all registered upstreams to arrive before flushing (fan-in)", () => {
    const component = new TestComponent(new CapacityModel(100, 0));
    component.registerUpstream("upstreamA");
    component.registerUpstream("upstreamB");

    component.onLoadReceived(10, "upstreamA");
    expect(component.onFlushSpy).not.toHaveBeenCalled();

    component.onLoadReceived(5, "upstreamB");
    expect(component.onFlushSpy).toHaveBeenCalledWith(15);
  });

  it("resets the arrival counter after flushing, ready for the next tick", () => {
    const component = new TestComponent(new CapacityModel(100, 0));
    component.registerUpstream("upstreamA");
    component.registerUpstream("upstreamB");

    component.onLoadReceived(10, "upstreamA");
    component.onLoadReceived(5, "upstreamB");
    component.onFlushSpy.mockClear();

    component.onLoadReceived(3, "upstreamA");
    expect(component.onFlushSpy).not.toHaveBeenCalled();
    component.onLoadReceived(4, "upstreamB");
    expect(component.onFlushSpy).toHaveBeenCalledWith(7);
  });

  it("applies the capacity model before flushing and reports drops in the snapshot", () => {
    const component = new TestComponent(new CapacityModel(10, 0));
    component.onLoadReceived(15, "upstream1");
    expect(component.onFlushSpy).toHaveBeenCalledWith(10);
    const snapshot = component.getSnapshot();
    expect(snapshot.droppedThisTick).toBe(5);
    expect(snapshot.status).toBe("overloaded");
  });

  it("reports idle status and zero utilization with no capacity model and no traffic", () => {
    const component = new TestComponent();
    const snapshot = component.getSnapshot();
    expect(snapshot.status).toBe("idle");
    expect(snapshot.utilization).toBe(0);
  });

  it("unregisterUpstream never drops the expected count below zero", () => {
    const component = new TestComponent(new CapacityModel(100, 0));
    component.unregisterUpstream("neverRegistered");
    component.onLoadReceived(10, "upstream1");
    expect(component.onFlushSpy).toHaveBeenCalledWith(10);
  });
});
