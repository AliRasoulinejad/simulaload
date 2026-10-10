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

  it("canConnect rejects a second outgoing edge from an Entry Point (single-forward publisher)", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new LoadBalancerComponent("lb1", { capacity: 10, queueDepth: 0 }));
    engine.addNode(new CdnComponent("cdn1", { capacity: 10, queueDepth: 0, cacheHitRatio: 0 }));
    engine.addEdge("entry", "lb1", "e1");
    expect(engine.canConnect("entry", "cdn1")).toBe(false);
  });

  it("canConnect still allows a LoadBalancer/Application with an existing edge to add another", () => {
    const engine = new SimulationEngine();
    const lb = new LoadBalancerComponent("lb", { capacity: 100, queueDepth: 0 });
    const app1 = new ApplicationComponent("app1", { capacity: 100, queueDepth: 0 });
    const app2 = new ApplicationComponent("app2", { capacity: 100, queueDepth: 0 });
    const cache = new CacheComponent("cache", { capacity: 100, queueDepth: 0, hitRatio: 0 });

    engine.addNode(lb);
    engine.addNode(app1);
    engine.addNode(app2);
    engine.addNode(cache);
    engine.addEdge("lb", "app1", "e1");

    expect(engine.canConnect("lb", "app2")).toBe(true);
    expect(engine.canConnect("app1", "cache")).toBe(true);
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

  it("getEdges returns the edges added via addEdge", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new LoadBalancerComponent("lb", { capacity: 10, queueDepth: 0 }));
    engine.addEdge("entry", "lb", "e1", 100);

    expect(engine.getEdges()).toEqual([{ edgeId: "e1", sourceId: "entry", targetId: "lb", weight: 100 }]);
  });

  it("caches getSnapshot() result until the next mutation", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));

    const snapshot1 = engine.getSnapshot();
    const snapshot2 = engine.getSnapshot();
    expect(Object.is(snapshot1, snapshot2)).toBe(true);

    engine.tick();

    const snapshot3 = engine.getSnapshot();
    expect(Object.is(snapshot2, snapshot3)).toBe(false);
  });

  it("counts only upstreams reachable from the Entry Point, so fan-in load is correct on every tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 40 }));
    engine.addNode(new ApplicationComponent("appA", { capacity: 1000, queueDepth: 0 }));
    engine.addNode(new ApplicationComponent("appB", { capacity: 1000, queueDepth: 0 }));
    engine.addNode(new DatabaseComponent("db", { capacity: 1000, queueDepth: 0 }));
    engine.addEdge("entry", "appA", "e1");
    engine.addEdge("appA", "db", "e2");
    engine.addEdge("appB", "db", "e3"); // appB has no incoming edge: unreachable

    engine.tick();
    expect(engine.getSnapshot().nodes["db"].currentRps).toBe(40);
    engine.tick();
    expect(engine.getSnapshot().nodes["db"].currentRps).toBe(40);

    // Once appB becomes reachable (via an LB splitting 50/50), db waits for both upstreams each tick.
    engine.addNode(new LoadBalancerComponent("lb", { capacity: 1000, queueDepth: 0 }));
    engine.removeEdge("e1");
    engine.addEdge("entry", "lb", "e4");
    engine.addEdge("lb", "appA", "e5");
    engine.addEdge("lb", "appB", "e6");
    for (let i = 0; i < 2; i += 1) {
      engine.tick();
      const nodes = engine.getSnapshot().nodes;
      expect(nodes["appA"].currentRps).toBe(20);
      expect(nodes["appB"].currentRps).toBe(20);
      expect(nodes["db"].currentRps).toBe(40);
    }
  });

  it("rejects a second parallel edge between the same source and target", () => {
    const engine = new SimulationEngine();
    engine.addNode(new LoadBalancerComponent("lb", { capacity: 100, queueDepth: 0 }));
    engine.addNode(new ApplicationComponent("app", { capacity: 100, queueDepth: 0 }));
    engine.addEdge("lb", "app", "e1");

    expect(engine.canConnect("lb", "app")).toBe(false);
    expect(() => engine.addEdge("lb", "app", "e2")).toThrow(/already exists/);
    expect(engine.getEdges()).toHaveLength(1);
  });

  it("clear() empties the engine in place, keeps listeners, and allows a new Entry Point", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    engine.addNode(new LoadBalancerComponent("lb", { capacity: 10, queueDepth: 0 }));
    engine.addEdge("entry", "lb", "e1");
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.clear();

    expect(engine.getSnapshot().nodes).toEqual({});
    expect(engine.getEdges()).toEqual([]);
    expect(listener).toHaveBeenCalled();
    expect(() => engine.addNode(new EntryPointComponent("entry2", { targetRps: 10 }))).not.toThrow();
  });
});
