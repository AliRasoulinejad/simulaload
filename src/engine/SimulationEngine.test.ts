import { describe, it, expect, vi } from "vitest";
import { SimulationEngine } from "./SimulationEngine";
import { EntryPointComponent } from "./components/EntryPointComponent";
import { CdnComponent } from "./components/CdnComponent";
import { LoadBalancerComponent } from "./components/LoadBalancerComponent";
import { ApplicationComponent } from "./components/ApplicationComponent";
import { CacheComponent } from "./components/CacheComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";

describe("SimulationEngine", () => {
  it("rejects adding a second Entry Point", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("e1", { targetRps: 10 }));
    expect(() => engine.addNode(new EntryPointComponent("e2", { targetRps: 10 }))).toThrow();
  });

  it("propagates load end-to-end through Entry Point -> LoadBalancer -> Application -> Cache -> Database on a manual tick", () => {
    const engine = new SimulationEngine();
    const entry = new EntryPointComponent("entry", { targetRps: 100 });
    const lb = new LoadBalancerComponent("lb", { capacity: 1000, queueDepth: 0 });
    const app = new ApplicationComponent("app", { capacity: 1000, queueDepth: 0 });
    const cache = new CacheComponent("cache", { capacity: 1000, queueDepth: 0, hitRatio: 0.5 });
    const db = new DatabaseComponent("db", { capacity: 1000, queueDepth: 0 });

    engine.addNode(entry);
    engine.addNode(lb);
    engine.addNode(app);
    engine.addNode(cache);
    engine.addNode(db);
    engine.addEdge("entry", "lb", "e1", 100);
    engine.addEdge("lb", "app", "e2", 100);
    engine.addEdge("app", "cache", "e3", 100);
    engine.addEdge("cache", "db", "e4", 100);

    engine.tick();

    const snapshot = engine.getSnapshot();
    expect(snapshot.nodes["lb"].currentRps).toBe(100);
    expect(snapshot.nodes["app"].currentRps).toBe(100);
    expect(snapshot.nodes["cache"].currentRps).toBe(100);
    expect(snapshot.nodes["db"].currentRps).toBe(50); // 50% hit ratio absorbed at cache
  });

  it("rejects an edge that violates the upstream-type matrix", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new CacheComponent("cache", { capacity: 10, queueDepth: 0, hitRatio: 0 }));
    expect(() => engine.addEdge("entry", "cache", "e1")).toThrow();
  });

  it("rejects an edge that would create a cycle", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new LoadBalancerComponent("lb", { capacity: 10, queueDepth: 0 }));
    engine.addNode(new ApplicationComponent("app", { capacity: 10, queueDepth: 0 }));
    engine.addEdge("entry", "lb", "e1");
    engine.addEdge("lb", "app", "e2");
    expect(() => engine.addEdge("app", "lb", "e3")).toThrow();
  });

  it("canConnect reports true/false without throwing or mutating the graph", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new CdnComponent("cdn", { capacity: 10, queueDepth: 0, cacheHitRatio: 0 }));
    engine.addNode(new CacheComponent("cache", { capacity: 10, queueDepth: 0, hitRatio: 0 }));

    expect(engine.canConnect("entry", "cdn")).toBe(true);
    expect(engine.canConnect("entry", "cache")).toBe(false);
  });

  it("removeNode unsubscribes every edge touching it, leaving survivors with a correct upstream count", () => {
    const engine = new SimulationEngine();
    const entry = new EntryPointComponent("entry", { targetRps: 100 });
    const app = new ApplicationComponent("app", { capacity: 1000, queueDepth: 0 });
    const db = new DatabaseComponent("db", { capacity: 1000, queueDepth: 0 });

    engine.addNode(entry);
    engine.addNode(app);
    engine.addNode(db);
    engine.addEdge("entry", "app", "e1");
    engine.addEdge("app", "db", "e2");

    engine.removeNode("app");
    engine.tick();

    // db had exactly one upstream (app), now removed; db should receive nothing and stay idle.
    expect(engine.getSnapshot().nodes["db"].currentRps).toBe(0);
    expect(engine.getSnapshot().nodes["db"]).toBeDefined();
    expect(() => engine.addEdge("entry", "db", "e3")).toThrow(); // database still can't accept entryPoint
  });

  it("rejects a second outgoing edge from an Entry Point (single-forward publisher)", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new LoadBalancerComponent("lb1", { capacity: 10, queueDepth: 0 }));
    engine.addNode(new CdnComponent("cdn1", { capacity: 10, queueDepth: 0, cacheHitRatio: 0 }));
    engine.addEdge("entry", "lb1", "e1");
    expect(() => engine.addEdge("entry", "cdn1", "e2")).toThrow();
  });

  it("allows a LoadBalancer and an Application to each have multiple outgoing edges", () => {
    const engine = new SimulationEngine();
    const lb = new LoadBalancerComponent("lb", { capacity: 100, queueDepth: 0 });
    const app1 = new ApplicationComponent("app1", { capacity: 100, queueDepth: 0 });
    const app2 = new ApplicationComponent("app2", { capacity: 100, queueDepth: 0 });
    const cache = new CacheComponent("cache", { capacity: 100, queueDepth: 0, hitRatio: 0 });
    const db = new DatabaseComponent("db", { capacity: 100, queueDepth: 0 });

    engine.addNode(lb);
    engine.addNode(app1);
    engine.addNode(app2);
    engine.addNode(cache);
    engine.addNode(db);

    expect(() => engine.addEdge("lb", "app1", "e1")).not.toThrow();
    expect(() => engine.addEdge("lb", "app2", "e2")).not.toThrow();
    expect(() => engine.addEdge("app1", "cache", "e3")).not.toThrow();
    expect(() => engine.addEdge("app1", "db", "e4")).not.toThrow();
  });

  it("notifies subscribers after every manual tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.tick();

    expect(listener).toHaveBeenCalled();
  });
});
