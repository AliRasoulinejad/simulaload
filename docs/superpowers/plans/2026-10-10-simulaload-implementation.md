# Simulaload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Simulaload — a client-side, drag-and-drop visual load-flow simulator with a pub/sub reactive engine and a React Flow canvas.

**Architecture:** A framework-agnostic TypeScript simulation engine (interface-segregated component classes, Observer-pattern load propagation, no central scheduler) sits underneath a React Flow canvas UI. The engine and UI communicate only through `SimulationEngine`'s snapshot/subscribe API and typed method calls — no shared mutable state.

**Tech Stack:** React 19, TypeScript, Vite, `@xyflow/react` (canvas), `zod` (JSON validation), `vitest` + `@testing-library/react` (testing).

**Spec:** `docs/superpowers/specs/2026-10-10-simulaload-design.md`

## Global Constraints

- Tick rate is fixed at `deltaSeconds = 0.25` (not user-configurable in v1) — defined once as `DEFAULT_TICK_SECONDS` in `src/engine/constants.ts`.
- Unit convention (resolves a rate/count ambiguity the spec leaves implicit): `targetRps`, `capacity`, and every `accept`/`absorb`/`dispatch` amount passed between components are **rates** (requests/second). `queueDepth` and `currentQueue` are **counts** (requests sitting in a buffer). `CapacityModel.accept()` is the only place that bridges the two, by multiplying rates by `deltaSeconds`.
- Exactly one Entry Point per graph; it has no incoming edges and exactly one outgoing edge.
- The graph must stay acyclic; invalid upstream-type pairings and cycle-forming edges are rejected at the moment they'd be created, never simulated.
- No backend, no auto-save, no templates, no auth/payment gating in v1 (spec §1, §7).
- New dependencies are limited to: `@xyflow/react`, `zod`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` (spec §9). Do not add others without updating the spec.

## Review Focus

- **Zero/negative capacity or weight values**: `WeightedSplitStrategy` with all-zero weights must not divide by zero; `CapacityModel` with `capacity = 0` must drop everything cleanly, never produce `NaN`. Covered in Task 2 and Task 4 tests.
- **Cyclic edge creation**: dragging a connection that would close a loop must be rejected atomically (no partial wiring). Covered in Task 11 tests.
- **Removing a node with live subscriptions**: must unsubscribe every edge touching it (as source and as target) so survivors' `expectedUpstreamCount` stays correct and no stale `onLoadReceived` calls linger. Covered in Task 11 tests.
- **Importing malformed/foreign JSON**: unknown component type, duplicate node IDs, an edge referencing a nonexistent node, or more than one `entryPoint` must be rejected with a clear error and must not partially mutate the live graph. Covered in Task 12 tests.
- **Entry Point load driven to zero (or changed) while running**: downstream nodes must reflect zero cleanly (no `NaN`/`Infinity` utilization) and `setConfig` must take effect on the next tick without restarting the clock. Covered in Task 7 tests.

---

## Task 1: Project Setup — Test Runner & New Dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/engine/constants.ts`
- Test: `src/engine/constants.test.ts`

**Interfaces:**
- Produces: `DEFAULT_TICK_SECONDS: number` (used by every later engine task).

- [ ] **Step 1: Install dependencies**

```bash
npm install @xyflow/react zod
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: false,
  },
});
```

- [ ] **Step 3: Write `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test script to `package.json`**

Add `"test": "vitest run"` to the `scripts` block (alongside the existing `dev`, `build`, `lint`, `preview`).

- [ ] **Step 5: Write `src/engine/constants.ts`**

```ts
export const DEFAULT_TICK_SECONDS = 0.25;
```

- [ ] **Step 6: Write the smoke test**

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TICK_SECONDS } from "./constants";

describe("constants", () => {
  it("fixes the tick rate at 0.25 seconds", () => {
    expect(DEFAULT_TICK_SECONDS).toBe(0.25);
  });
});
```

- [ ] **Step 7: Run the test suite**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/engine/constants.ts src/engine/constants.test.ts
git commit -m "chore: add vitest, testing-library, and new runtime dependencies"
```

---

## Task 2: Core Types, Interfaces & CapacityModel

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/interfaces.ts`
- Create: `src/engine/models/CapacityModel.ts`
- Test: `src/engine/models/CapacityModel.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ComponentType`, `NodeId`, `EdgeId`, `WeightedEdge`, `AcceptResult`, `AbsorbResult`, `NodeMetricsSnapshot`, `EngineSnapshot`, `*Config` types (`src/engine/types.ts`); `CapacityModelInterface`, `AbsorptionModelInterface`, `DispatchStrategyInterface`, `ConfigurableInterface<T>`, `MetricsSnapshotInterface`, `LoadPublisherInterface`, `LoadSubscriberInterface` (`src/engine/interfaces.ts`); `CapacityModel` class.

- [ ] **Step 1: Write `src/engine/types.ts`**

```ts
export type NodeId = string;
export type EdgeId = string;

export type ComponentType =
  | "entryPoint"
  | "cdn"
  | "loadBalancer"
  | "application"
  | "cache"
  | "database";

export interface WeightedEdge {
  edgeId: EdgeId;
  targetId: NodeId;
  weight: number;
}

export interface AcceptResult {
  accepted: number;
  queued: number;
  dropped: number;
}

export interface AbsorbResult {
  absorbed: number;
  remainder: number;
}

export type NodeStatus = "idle" | "healthy" | "degraded" | "overloaded";

export interface NodeMetricsSnapshot {
  nodeId: NodeId;
  type: ComponentType;
  currentRps: number;
  utilization: number;
  queueLength: number;
  droppedThisTick: number;
  droppedTotal: number;
  status: NodeStatus;
}

export interface EngineSnapshot {
  nodes: Record<NodeId, NodeMetricsSnapshot>;
  edgeLoads: Record<EdgeId, number>;
}

export interface EntryPointConfig {
  targetRps: number;
}

export interface CdnConfig {
  capacity: number;
  queueDepth: number;
  cacheHitRatio: number;
}

export interface LoadBalancerConfig {
  capacity: number;
  queueDepth: number;
}

export interface ApplicationConfig {
  capacity: number;
  queueDepth: number;
}

export interface CacheConfig {
  capacity: number;
  queueDepth: number;
  hitRatio: number;
}

export interface DatabaseConfig {
  capacity: number;
  queueDepth: number;
}
```

- [ ] **Step 2: Write `src/engine/interfaces.ts`**

```ts
import type {
  AbsorbResult,
  AcceptResult,
  ComponentType,
  EdgeId,
  NodeId,
  NodeMetricsSnapshot,
  WeightedEdge,
} from "./types";

export interface CapacityModelInterface {
  readonly capacity: number;
  readonly queueDepth: number;
  readonly currentQueue: number;
  accept(incoming: number, deltaSeconds: number): AcceptResult;
}

export interface AbsorptionModelInterface {
  readonly absorptionRatio: number;
  absorb(incoming: number): AbsorbResult;
}

export interface DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number>;
}

export interface ConfigurableInterface<TConfig> {
  getConfig(): TConfig;
  setConfig(partial: Partial<TConfig>): void;
}

export interface MetricsSnapshotInterface {
  getSnapshot(): NodeMetricsSnapshot;
}

export interface LoadSubscriberInterface {
  readonly nodeId: NodeId;
  readonly type: ComponentType;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType>;
  canAcceptUpstream(publisherType: ComponentType): boolean;
  registerUpstream(publisherId: NodeId): void;
  unregisterUpstream(publisherId: NodeId): void;
  onLoadReceived(amount: number, fromNodeId: NodeId): void;
}

export interface LoadPublisherInterface {
  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void;
  unsubscribe(subscriberId: NodeId): void;
}
```

- [ ] **Step 3: Write the failing tests for `CapacityModel`**

```ts
import { describe, it, expect } from "vitest";
import { CapacityModel } from "./CapacityModel";

describe("CapacityModel", () => {
  it("accepts everything when under capacity", () => {
    const model = new CapacityModel(10, 5);
    const result = model.accept(6, 1);
    expect(result).toEqual({ accepted: 6, queued: 0, dropped: 0 });
  });

  it("queues the overflow up to queueDepth, then drops the rest", () => {
    const model = new CapacityModel(10, 3);
    const result = model.accept(15, 1);
    expect(result).toEqual({ accepted: 10, queued: 3, dropped: 2 });
  });

  it("drains a previously queued backlog on the next tick", () => {
    const model = new CapacityModel(10, 3);
    model.accept(15, 1); // queue = 3
    const result = model.accept(5, 1); // total pending = 5 + 3 = 8, capacity 10
    expect(result).toEqual({ accepted: 8, queued: 0, dropped: 0 });
    expect(model.currentQueue).toBe(0);
  });

  it("drops everything when capacity is zero, without producing NaN", () => {
    const model = new CapacityModel(0, 0);
    const result = model.accept(5, 1);
    expect(result).toEqual({ accepted: 0, queued: 0, dropped: 5 });
    expect(Number.isNaN(result.accepted)).toBe(false);
  });

  it("scales by deltaSeconds smaller than one second", () => {
    const model = new CapacityModel(10, 0);
    // over 0.25s, capacity allows 2.5 request-units through
    const result = model.accept(10, 0.25);
    expect(result.accepted).toBeCloseTo(10, 5);
    expect(result.dropped).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- CapacityModel`
Expected: FAIL — `CapacityModel` module does not exist yet.

- [ ] **Step 5: Implement `src/engine/models/CapacityModel.ts`**

```ts
import type { AcceptResult } from "../types";
import type { CapacityModelInterface } from "../interfaces";

export class CapacityModel implements CapacityModelInterface {
  capacity: number;
  queueDepth: number;
  private queue = 0;
  private droppedTotal = 0;

  constructor(capacity: number, queueDepth: number) {
    this.capacity = capacity;
    this.queueDepth = queueDepth;
  }

  get currentQueue(): number {
    return this.queue;
  }

  get cumulativeDropped(): number {
    return this.droppedTotal;
  }

  accept(incoming: number, deltaSeconds: number): AcceptResult {
    const incomingCount = incoming * deltaSeconds;
    const capacityCount = this.capacity * deltaSeconds;
    const totalPending = incomingCount + this.queue;
    const processedCount = Math.min(totalPending, capacityCount);
    const remainder = totalPending - processedCount;
    const queuedCount = Math.min(remainder, this.queueDepth);
    const droppedCount = remainder - queuedCount;

    this.queue = queuedCount;
    this.droppedTotal += droppedCount;

    if (deltaSeconds === 0) {
      return { accepted: 0, queued: queuedCount, dropped: 0 };
    }

    return {
      accepted: processedCount / deltaSeconds,
      queued: queuedCount / deltaSeconds,
      dropped: droppedCount / deltaSeconds,
    };
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- CapacityModel`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/interfaces.ts src/engine/models/CapacityModel.ts src/engine/models/CapacityModel.test.ts
git commit -m "feat(engine): add core types, interfaces, and CapacityModel"
```

---

## Task 3: AbsorptionModel

**Files:**
- Create: `src/engine/models/AbsorptionModel.ts`
- Test: `src/engine/models/AbsorptionModel.test.ts`

**Interfaces:**
- Consumes: `AbsorptionModelInterface`, `AbsorbResult` from Task 2.
- Produces: `AbsorptionModel` class, used by `CdnComponent` and `CacheComponent` (Tasks 7, 10).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { AbsorptionModel } from "./AbsorptionModel";

describe("AbsorptionModel", () => {
  it("absorbs the configured ratio and forwards the remainder", () => {
    const model = new AbsorptionModel(0.7);
    expect(model.absorb(10)).toEqual({ absorbed: 7, remainder: 3 });
  });

  it("forwards everything when the ratio is zero", () => {
    const model = new AbsorptionModel(0);
    expect(model.absorb(10)).toEqual({ absorbed: 0, remainder: 10 });
  });

  it("absorbs everything when the ratio is one", () => {
    const model = new AbsorptionModel(1);
    expect(model.absorb(10)).toEqual({ absorbed: 10, remainder: 0 });
  });

  it("allows the ratio to be changed live via the mutable field", () => {
    const model = new AbsorptionModel(0.5);
    model.absorptionRatio = 0.9;
    expect(model.absorb(10)).toEqual({ absorbed: 9, remainder: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- AbsorptionModel`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/models/AbsorptionModel.ts`**

```ts
import type { AbsorbResult } from "../types";
import type { AbsorptionModelInterface } from "../interfaces";

export class AbsorptionModel implements AbsorptionModelInterface {
  absorptionRatio: number;

  constructor(absorptionRatio: number) {
    this.absorptionRatio = absorptionRatio;
  }

  absorb(incoming: number): AbsorbResult {
    const absorbed = incoming * this.absorptionRatio;
    return { absorbed, remainder: incoming - absorbed };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- AbsorptionModel`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/models/AbsorptionModel.ts src/engine/models/AbsorptionModel.test.ts
git commit -m "feat(engine): add AbsorptionModel"
```

---

## Task 4: Dispatch Strategies

**Files:**
- Create: `src/engine/strategies/WeightedSplitStrategy.ts`
- Create: `src/engine/strategies/BroadcastStrategy.ts`
- Create: `src/engine/strategies/SingleForwardStrategy.ts`
- Test: `src/engine/strategies/WeightedSplitStrategy.test.ts`
- Test: `src/engine/strategies/BroadcastStrategy.test.ts`
- Test: `src/engine/strategies/SingleForwardStrategy.test.ts`

**Interfaces:**
- Consumes: `DispatchStrategyInterface`, `WeightedEdge`, `EdgeId` from Task 2.
- Produces: the three strategy classes, used by `SubscriptionRegistry` (Task 5) and every publisher-capable component (Tasks 7–9).

- [ ] **Step 1: Write the failing tests for `WeightedSplitStrategy`**

```ts
import { describe, it, expect } from "vitest";
import { WeightedSplitStrategy } from "./WeightedSplitStrategy";

describe("WeightedSplitStrategy", () => {
  it("splits proportionally to weight", () => {
    const strategy = new WeightedSplitStrategy();
    const outputs = strategy.computeOutputs(100, [
      { edgeId: "a", targetId: "n1", weight: 70 },
      { edgeId: "b", targetId: "n2", weight: 30 },
    ]);
    expect(outputs.get("a")).toBeCloseTo(70, 5);
    expect(outputs.get("b")).toBeCloseTo(30, 5);
  });

  it("returns zero for every edge when all weights are zero, without NaN", () => {
    const strategy = new WeightedSplitStrategy();
    const outputs = strategy.computeOutputs(100, [
      { edgeId: "a", targetId: "n1", weight: 0 },
      { edgeId: "b", targetId: "n2", weight: 0 },
    ]);
    expect(outputs.get("a")).toBe(0);
    expect(outputs.get("b")).toBe(0);
  });

  it("returns an empty map for no edges", () => {
    const strategy = new WeightedSplitStrategy();
    expect(strategy.computeOutputs(100, []).size).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing tests for `BroadcastStrategy`**

```ts
import { describe, it, expect } from "vitest";
import { BroadcastStrategy } from "./BroadcastStrategy";

describe("BroadcastStrategy", () => {
  it("sends the full amount down every edge", () => {
    const strategy = new BroadcastStrategy();
    const outputs = strategy.computeOutputs(50, [
      { edgeId: "a", targetId: "n1", weight: 0 },
      { edgeId: "b", targetId: "n2", weight: 0 },
    ]);
    expect(outputs.get("a")).toBe(50);
    expect(outputs.get("b")).toBe(50);
  });
});
```

- [ ] **Step 3: Write the failing tests for `SingleForwardStrategy`**

```ts
import { describe, it, expect } from "vitest";
import { SingleForwardStrategy } from "./SingleForwardStrategy";

describe("SingleForwardStrategy", () => {
  it("sends the full amount to the single edge", () => {
    const strategy = new SingleForwardStrategy();
    const outputs = strategy.computeOutputs(42, [{ edgeId: "a", targetId: "n1", weight: 0 }]);
    expect(outputs.get("a")).toBe(42);
  });

  it("returns an empty map when there is no edge", () => {
    const strategy = new SingleForwardStrategy();
    expect(strategy.computeOutputs(42, []).size).toBe(0);
  });
});
```

- [ ] **Step 4: Run all three test files to verify they fail**

Run: `npm test -- strategies`
Expected: FAIL — none of the three modules exist yet.

- [ ] **Step 5: Implement `src/engine/strategies/WeightedSplitStrategy.ts`**

```ts
import type { EdgeId, WeightedEdge } from "../types";
import type { DispatchStrategyInterface } from "../interfaces";

export class WeightedSplitStrategy implements DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number> {
    const outputs = new Map<EdgeId, number>();
    const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0);

    if (totalWeight <= 0) {
      for (const edge of edges) outputs.set(edge.edgeId, 0);
      return outputs;
    }

    for (const edge of edges) {
      outputs.set(edge.edgeId, availableLoad * (edge.weight / totalWeight));
    }
    return outputs;
  }
}
```

- [ ] **Step 6: Implement `src/engine/strategies/BroadcastStrategy.ts`**

```ts
import type { EdgeId, WeightedEdge } from "../types";
import type { DispatchStrategyInterface } from "../interfaces";

export class BroadcastStrategy implements DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number> {
    const outputs = new Map<EdgeId, number>();
    for (const edge of edges) outputs.set(edge.edgeId, availableLoad);
    return outputs;
  }
}
```

- [ ] **Step 7: Implement `src/engine/strategies/SingleForwardStrategy.ts`**

```ts
import type { EdgeId, WeightedEdge } from "../types";
import type { DispatchStrategyInterface } from "../interfaces";

export class SingleForwardStrategy implements DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number> {
    const outputs = new Map<EdgeId, number>();
    if (edges.length === 0) return outputs;
    outputs.set(edges[0].edgeId, availableLoad);
    return outputs;
  }
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- strategies`
Expected: 8 passed.

- [ ] **Step 9: Commit**

```bash
git add src/engine/strategies
git commit -m "feat(engine): add WeightedSplit, Broadcast, and SingleForward dispatch strategies"
```

---

## Task 5: SubscriptionRegistry

**Files:**
- Create: `src/engine/SubscriptionRegistry.ts`
- Test: `src/engine/SubscriptionRegistry.test.ts`

**Interfaces:**
- Consumes: `LoadPublisherInterface`, `LoadSubscriberInterface`, `DispatchStrategyInterface`, `WeightedEdge` from Task 2; `SingleForwardStrategy`/`BroadcastStrategy`/`WeightedSplitStrategy` from Task 4 (used only in tests here via a stub strategy).
- Produces: `SubscriptionRegistry` class — `subscribe`, `unsubscribe`, `updateEdgeWeight`, `dispatch`, `getLastDispatch`. Used by every publisher-capable component (Tasks 7–9) and `SimulationEngine` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- SubscriptionRegistry`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/SubscriptionRegistry.ts`**

```ts
import type { ComponentType, EdgeId, NodeId, WeightedEdge } from "./types";
import type { DispatchStrategyInterface, LoadPublisherInterface, LoadSubscriberInterface } from "./interfaces";

interface SubscriberEntry {
  subscriber: LoadSubscriberInterface;
  edge: WeightedEdge;
}

export class SubscriptionRegistry implements LoadPublisherInterface {
  private subscribers = new Map<NodeId, SubscriberEntry>();
  private lastDispatch = new Map<EdgeId, number>();

  constructor(
    private readonly publisherNodeId: NodeId,
    private readonly publisherType: ComponentType,
  ) {}

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    if (!subscriber.canAcceptUpstream(this.publisherType)) {
      throw new Error(`${subscriber.nodeId} cannot accept upstream of type ${this.publisherType}`);
    }
    this.subscribers.set(subscriber.nodeId, { subscriber, edge });
    subscriber.registerUpstream(this.publisherNodeId);
  }

  unsubscribe(subscriberId: NodeId): void {
    const entry = this.subscribers.get(subscriberId);
    if (!entry) return;
    entry.subscriber.unregisterUpstream(this.publisherNodeId);
    this.subscribers.delete(subscriberId);
    this.lastDispatch.delete(entry.edge.edgeId);
  }

  updateEdgeWeight(edgeId: EdgeId, weight: number): void {
    for (const entry of this.subscribers.values()) {
      if (entry.edge.edgeId === edgeId) entry.edge.weight = weight;
    }
  }

  dispatch(outgoing: number, strategy: DispatchStrategyInterface): void {
    const entries = Array.from(this.subscribers.values());
    if (entries.length === 0) return;

    const edges = entries.map((entry) => entry.edge);
    const outputs = strategy.computeOutputs(outgoing, edges);

    for (const entry of entries) {
      const amount = outputs.get(entry.edge.edgeId) ?? 0;
      this.lastDispatch.set(entry.edge.edgeId, amount);
      entry.subscriber.onLoadReceived(amount, this.publisherNodeId);
    }
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.lastDispatch;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- SubscriptionRegistry`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/SubscriptionRegistry.ts src/engine/SubscriptionRegistry.test.ts
git commit -m "feat(engine): add SubscriptionRegistry for pub/sub edge management"
```

---

## Task 6: ReactiveSubscriberBase

**Files:**
- Create: `src/engine/ReactiveSubscriberBase.ts`
- Test: `src/engine/ReactiveSubscriberBase.test.ts`

**Interfaces:**
- Consumes: `LoadSubscriberInterface`, `MetricsSnapshotInterface`, `CapacityModelInterface`, `AbsorptionModelInterface`, `NodeMetricsSnapshot`, `DEFAULT_TICK_SECONDS`.
- Produces: `ReactiveSubscriberBase` abstract class with protected abstract `onFlush(outgoing: number): void`, used by `CdnComponent`, `LoadBalancerComponent`, `ApplicationComponent`, `CacheComponent`, `DatabaseComponent` (Tasks 7–10).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ReactiveSubscriberBase`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/ReactiveSubscriberBase.ts`**

```ts
import { DEFAULT_TICK_SECONDS } from "./constants";
import type { CapacityModelInterface, AbsorptionModelInterface, LoadSubscriberInterface, MetricsSnapshotInterface } from "./interfaces";
import type { ComponentType, NodeId, NodeMetricsSnapshot, NodeStatus } from "./types";

export abstract class ReactiveSubscriberBase implements LoadSubscriberInterface, MetricsSnapshotInterface {
  abstract readonly nodeId: NodeId;
  abstract readonly type: ComponentType;
  abstract readonly allowedUpstreamTypes: ReadonlySet<ComponentType>;

  private expectedUpstreamCount = 0;
  private buffer = 0;
  private arrivals = 0;
  private lastAcceptedRps = 0;
  private lastDroppedThisTick = 0;
  private droppedTotal = 0;

  protected constructor(
    protected readonly capacityModel?: CapacityModelInterface,
    protected readonly absorptionModel?: AbsorptionModelInterface,
  ) {}

  canAcceptUpstream(publisherType: ComponentType): boolean {
    return this.allowedUpstreamTypes.has(publisherType);
  }

  registerUpstream(_publisherId: NodeId): void {
    this.expectedUpstreamCount += 1;
  }

  unregisterUpstream(_publisherId: NodeId): void {
    this.expectedUpstreamCount = Math.max(0, this.expectedUpstreamCount - 1);
  }

  onLoadReceived(amount: number, _fromNodeId: NodeId): void {
    this.buffer += amount;
    this.arrivals += 1;
    const expected = Math.max(this.expectedUpstreamCount, 1);
    if (this.arrivals >= expected) {
      const incoming = this.buffer;
      this.buffer = 0;
      this.arrivals = 0;
      this.processTick(incoming, DEFAULT_TICK_SECONDS);
    }
  }

  private processTick(incoming: number, deltaSeconds: number): void {
    let afterCapacity = incoming;
    let dropped = 0;

    if (this.capacityModel) {
      const result = this.capacityModel.accept(incoming, deltaSeconds);
      afterCapacity = result.accepted;
      dropped = result.dropped;
    }

    this.lastAcceptedRps = afterCapacity;
    this.lastDroppedThisTick = dropped;
    this.droppedTotal += dropped;

    let outgoing = afterCapacity;
    if (this.absorptionModel) {
      outgoing = this.absorptionModel.absorb(afterCapacity).remainder;
    }

    this.onFlush(outgoing);
  }

  protected abstract onFlush(outgoing: number): void;

  getSnapshot(): NodeMetricsSnapshot {
    const capacity = this.capacityModel?.capacity;
    const utilization = !capacity || capacity <= 0 ? 0 : this.lastAcceptedRps / capacity;
    return {
      nodeId: this.nodeId,
      type: this.type,
      currentRps: this.lastAcceptedRps,
      utilization,
      queueLength: this.capacityModel?.currentQueue ?? 0,
      droppedThisTick: this.lastDroppedThisTick,
      droppedTotal: this.droppedTotal,
      status: this.computeStatus(utilization),
    };
  }

  private computeStatus(utilization: number): NodeStatus {
    if (this.lastAcceptedRps === 0 && this.lastDroppedThisTick === 0) return "idle";
    if (this.lastDroppedThisTick > 0) return "overloaded";
    if (utilization >= 0.8) return "degraded";
    return "healthy";
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ReactiveSubscriberBase`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/ReactiveSubscriberBase.ts src/engine/ReactiveSubscriberBase.test.ts
git commit -m "feat(engine): add ReactiveSubscriberBase with fan-in arrival counting"
```

---

## Task 7: EntryPointComponent & CdnComponent

**Files:**
- Create: `src/engine/components/EntryPointComponent.ts`
- Create: `src/engine/components/CdnComponent.ts`
- Test: `src/engine/components/EntryPointComponent.test.ts`
- Test: `src/engine/components/CdnComponent.test.ts`

**Interfaces:**
- Consumes: `LoadPublisherInterface`, `ConfigurableInterface`, `MetricsSnapshotInterface` (Task 2); `SubscriptionRegistry` (Task 5); `SingleForwardStrategy` (Task 4); `ReactiveSubscriberBase`, `CapacityModel`, `AbsorptionModel` (Tasks 3, 6).
- Produces: `EntryPointComponent` (with `startClock`, `stopClock`, `tick`, `getLastDispatch`) and `CdnComponent`, used by `SimulationEngine` (Task 11).

- [ ] **Step 1: Write the failing tests for `EntryPointComponent`**

```ts
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
```

- [ ] **Step 2: Write the failing tests for `CdnComponent`**

```ts
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
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npm test -- EntryPointComponent CdnComponent`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/engine/components/EntryPointComponent.ts`**

```ts
import { DEFAULT_TICK_SECONDS } from "../constants";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import type { ConfigurableInterface, LoadPublisherInterface, LoadSubscriberInterface, MetricsSnapshotInterface } from "../interfaces";
import type { EdgeId, EntryPointConfig, NodeId, NodeMetricsSnapshot, WeightedEdge } from "../types";

export class EntryPointComponent implements LoadPublisherInterface, ConfigurableInterface<EntryPointConfig>, MetricsSnapshotInterface {
  readonly type = "entryPoint" as const;
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private targetRps: number;
  private clockHandle: ReturnType<typeof setInterval> | null = null;
  private lastDispatchedRps = 0;

  constructor(public readonly nodeId: NodeId, config: EntryPointConfig) {
    this.targetRps = Math.max(0, config.targetRps);
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  startClock(tickSeconds: number = DEFAULT_TICK_SECONDS, onTick?: () => void): void {
    if (this.clockHandle) return;
    this.clockHandle = setInterval(() => {
      this.tick();
      onTick?.();
    }, tickSeconds * 1000);
  }

  stopClock(): void {
    if (this.clockHandle) {
      clearInterval(this.clockHandle);
      this.clockHandle = null;
    }
  }

  tick(): void {
    this.lastDispatchedRps = this.targetRps;
    this.registry.dispatch(this.targetRps, this.strategy);
  }

  getConfig(): EntryPointConfig {
    return { targetRps: this.targetRps };
  }

  setConfig(partial: Partial<EntryPointConfig>): void {
    if (partial.targetRps !== undefined) {
      this.targetRps = Math.max(0, partial.targetRps);
    }
  }

  getSnapshot(): NodeMetricsSnapshot {
    return {
      nodeId: this.nodeId,
      type: this.type,
      currentRps: this.lastDispatchedRps,
      utilization: 0,
      queueLength: 0,
      droppedThisTick: 0,
      droppedTotal: 0,
      status: this.lastDispatchedRps > 0 ? "healthy" : "idle",
    };
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }
}
```

- [ ] **Step 5: Implement `src/engine/components/CdnComponent.ts`**

```ts
import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import { CapacityModel } from "../models/CapacityModel";
import { AbsorptionModel } from "../models/AbsorptionModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { CdnConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class CdnComponent extends ReactiveSubscriberBase implements ConfigurableInterface<CdnConfig> {
  readonly type = "cdn" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private readonly capacityModelRef: CapacityModel;
  private readonly absorptionModelRef: AbsorptionModel;

  constructor(public readonly nodeId: NodeId, config: CdnConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    const absorptionModel = new AbsorptionModel(config.cacheHitRatio);
    super(capacityModel, absorptionModel);
    this.capacityModelRef = capacityModel;
    this.absorptionModelRef = absorptionModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): CdnConfig {
    return {
      capacity: this.capacityModelRef.capacity,
      queueDepth: this.capacityModelRef.queueDepth,
      cacheHitRatio: this.absorptionModelRef.absorptionRatio,
    };
  }

  setConfig(partial: Partial<CdnConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
    if (partial.cacheHitRatio !== undefined) this.absorptionModelRef.absorptionRatio = partial.cacheHitRatio;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- EntryPointComponent CdnComponent`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add src/engine/components/EntryPointComponent.ts src/engine/components/CdnComponent.ts src/engine/components/EntryPointComponent.test.ts src/engine/components/CdnComponent.test.ts
git commit -m "feat(engine): add EntryPointComponent and CdnComponent"
```

---

## Task 8: LoadBalancerComponent

**Files:**
- Create: `src/engine/components/LoadBalancerComponent.ts`
- Test: `src/engine/components/LoadBalancerComponent.test.ts`

**Interfaces:**
- Consumes: `ReactiveSubscriberBase` (Task 6), `SubscriptionRegistry` (Task 5), `WeightedSplitStrategy` (Task 4), `CapacityModel` (Task 2).
- Produces: `LoadBalancerComponent` with `setEdgeWeight(edgeId, weight)`, used by `SimulationEngine` (Task 11) and the Inspector panel (Task 17).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- LoadBalancerComponent`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/components/LoadBalancerComponent.ts`**

```ts
import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { WeightedSplitStrategy } from "../strategies/WeightedSplitStrategy";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { ComponentType, EdgeId, LoadBalancerConfig, NodeId, WeightedEdge } from "../types";

export class LoadBalancerComponent extends ReactiveSubscriberBase implements ConfigurableInterface<LoadBalancerConfig> {
  readonly type = "loadBalancer" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint", "cdn"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new WeightedSplitStrategy();
  private readonly capacityModelRef: CapacityModel;

  constructor(public readonly nodeId: NodeId, config: LoadBalancerConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.capacityModelRef = capacityModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  setEdgeWeight(edgeId: EdgeId, weight: number): void {
    this.registry.updateEdgeWeight(edgeId, weight);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): LoadBalancerConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<LoadBalancerConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- LoadBalancerComponent`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/components/LoadBalancerComponent.ts src/engine/components/LoadBalancerComponent.test.ts
git commit -m "feat(engine): add LoadBalancerComponent"
```

---

## Task 9: ApplicationComponent

**Files:**
- Create: `src/engine/components/ApplicationComponent.ts`
- Test: `src/engine/components/ApplicationComponent.test.ts`

**Interfaces:**
- Consumes: `ReactiveSubscriberBase` (Task 6), `SubscriptionRegistry` (Task 5), `BroadcastStrategy` (Task 4), `CapacityModel` (Task 2).
- Produces: `ApplicationComponent`, used by `SimulationEngine` (Task 11).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ApplicationComponent`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/components/ApplicationComponent.ts`**

```ts
import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { BroadcastStrategy } from "../strategies/BroadcastStrategy";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { ApplicationConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class ApplicationComponent extends ReactiveSubscriberBase implements ConfigurableInterface<ApplicationConfig> {
  readonly type = "application" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["entryPoint", "cdn", "loadBalancer"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new BroadcastStrategy();
  private readonly capacityModelRef: CapacityModel;

  constructor(public readonly nodeId: NodeId, config: ApplicationConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.capacityModelRef = capacityModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): ApplicationConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<ApplicationConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ApplicationComponent`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/components/ApplicationComponent.ts src/engine/components/ApplicationComponent.test.ts
git commit -m "feat(engine): add ApplicationComponent with broadcast dispatch"
```

---

## Task 10: CacheComponent & DatabaseComponent

**Files:**
- Create: `src/engine/components/CacheComponent.ts`
- Create: `src/engine/components/DatabaseComponent.ts`
- Test: `src/engine/components/CacheComponent.test.ts`
- Test: `src/engine/components/DatabaseComponent.test.ts`

**Interfaces:**
- Consumes: `ReactiveSubscriberBase` (Task 6), `SubscriptionRegistry` (Task 5), `SingleForwardStrategy` (Task 4), `CapacityModel`/`AbsorptionModel` (Tasks 2–3).
- Produces: `CacheComponent`, `DatabaseComponent` — `DatabaseComponent` has no `subscribe`/`unsubscribe` methods (no `LoadPublisherInterface`), confirming the spec's terminal-sink requirement.

- [ ] **Step 1: Write the failing tests for `CacheComponent`**

```ts
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
```

- [ ] **Step 2: Write the failing tests for `DatabaseComponent`**

```ts
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

    db.onLoadReceived(15, "app1");

    const snapshot = db.getSnapshot();
    expect(snapshot.currentRps).toBe(10);
    expect(snapshot.queueLength).toBe(2);
    expect(snapshot.droppedThisTick).toBe(3);
  });

  it("accepts both Application and Cache as upstream", () => {
    const db = new DatabaseComponent("db1", { capacity: 10, queueDepth: 2 });
    expect(db.canAcceptUpstream("application")).toBe(true);
    expect(db.canAcceptUpstream("cache")).toBe(true);
    expect(db.canAcceptUpstream("cdn")).toBe(false);
  });
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npm test -- CacheComponent DatabaseComponent`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/engine/components/CacheComponent.ts`**

```ts
import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { SubscriptionRegistry } from "../SubscriptionRegistry";
import { SingleForwardStrategy } from "../strategies/SingleForwardStrategy";
import { CapacityModel } from "../models/CapacityModel";
import { AbsorptionModel } from "../models/AbsorptionModel";
import type { ConfigurableInterface, LoadSubscriberInterface } from "../interfaces";
import type { CacheConfig, ComponentType, EdgeId, NodeId, WeightedEdge } from "../types";

export class CacheComponent extends ReactiveSubscriberBase implements ConfigurableInterface<CacheConfig> {
  readonly type = "cache" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["application"]);
  private readonly registry: SubscriptionRegistry;
  private readonly strategy = new SingleForwardStrategy();
  private readonly capacityModelRef: CapacityModel;
  private readonly absorptionModelRef: AbsorptionModel;

  constructor(public readonly nodeId: NodeId, config: CacheConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    const absorptionModel = new AbsorptionModel(config.hitRatio);
    super(capacityModel, absorptionModel);
    this.capacityModelRef = capacityModel;
    this.absorptionModelRef = absorptionModel;
    this.registry = new SubscriptionRegistry(nodeId, this.type);
  }

  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void {
    this.registry.subscribe(subscriber, edge);
  }

  unsubscribe(subscriberId: NodeId): void {
    this.registry.unsubscribe(subscriberId);
  }

  getLastDispatch(): ReadonlyMap<EdgeId, number> {
    return this.registry.getLastDispatch();
  }

  protected onFlush(outgoing: number): void {
    this.registry.dispatch(outgoing, this.strategy);
  }

  getConfig(): CacheConfig {
    return {
      capacity: this.capacityModelRef.capacity,
      queueDepth: this.capacityModelRef.queueDepth,
      hitRatio: this.absorptionModelRef.absorptionRatio,
    };
  }

  setConfig(partial: Partial<CacheConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
    if (partial.hitRatio !== undefined) this.absorptionModelRef.absorptionRatio = partial.hitRatio;
  }
}
```

- [ ] **Step 5: Implement `src/engine/components/DatabaseComponent.ts`**

```ts
import { ReactiveSubscriberBase } from "../ReactiveSubscriberBase";
import { CapacityModel } from "../models/CapacityModel";
import type { ConfigurableInterface } from "../interfaces";
import type { ComponentType, DatabaseConfig, NodeId } from "../types";

export class DatabaseComponent extends ReactiveSubscriberBase implements ConfigurableInterface<DatabaseConfig> {
  readonly type = "database" as const;
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType> = new Set(["application", "cache"]);
  private readonly capacityModelRef: CapacityModel;

  constructor(public readonly nodeId: NodeId, config: DatabaseConfig) {
    const capacityModel = new CapacityModel(config.capacity, config.queueDepth);
    super(capacityModel);
    this.capacityModelRef = capacityModel;
  }

  protected onFlush(_outgoing: number): void {
    // Terminal sink: Database never implements LoadPublisherInterface, so there is nothing downstream.
  }

  getConfig(): DatabaseConfig {
    return { capacity: this.capacityModelRef.capacity, queueDepth: this.capacityModelRef.queueDepth };
  }

  setConfig(partial: Partial<DatabaseConfig>): void {
    if (partial.capacity !== undefined) this.capacityModelRef.capacity = partial.capacity;
    if (partial.queueDepth !== undefined) this.capacityModelRef.queueDepth = partial.queueDepth;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- CacheComponent DatabaseComponent`
Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/engine/components/CacheComponent.ts src/engine/components/DatabaseComponent.ts src/engine/components/CacheComponent.test.ts src/engine/components/DatabaseComponent.test.ts
git commit -m "feat(engine): add CacheComponent and terminal DatabaseComponent"
```

---

## Task 11: SimulationEngine

**Files:**
- Create: `src/engine/SimulationEngine.ts`
- Test: `src/engine/SimulationEngine.test.ts`

**Interfaces:**
- Consumes: all six component classes (Tasks 7–10), `LoadPublisherInterface`, `LoadSubscriberInterface`, `EngineSnapshot`, `NodeMetricsSnapshot` (Task 2).
- Produces: `SimulationEngine` — `addNode`, `removeNode`, `addEdge`, `removeEdge`, `canConnect`, `start`, `pause`, `tick`, `getSnapshot`, `subscribe`, `getNode`. Consumed by the UI layer (Tasks 13–20).

- [ ] **Step 1: Write the failing tests**

```ts
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

  it("notifies subscribers after every manual tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 10 }));
    const listener = vi.fn();
    engine.subscribe(listener);

    engine.tick();

    expect(listener).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- SimulationEngine`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/SimulationEngine.ts`**

```ts
import { EntryPointComponent } from "./components/EntryPointComponent";
import { CdnComponent } from "./components/CdnComponent";
import { LoadBalancerComponent } from "./components/LoadBalancerComponent";
import { ApplicationComponent } from "./components/ApplicationComponent";
import { CacheComponent } from "./components/CacheComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";
import type { LoadPublisherInterface, LoadSubscriberInterface } from "./interfaces";
import type { EdgeId, EngineSnapshot, NodeId } from "./types";

export type AnyComponent =
  | EntryPointComponent
  | CdnComponent
  | LoadBalancerComponent
  | ApplicationComponent
  | CacheComponent
  | DatabaseComponent;

interface EdgeRecord {
  sourceId: NodeId;
  targetId: NodeId;
  weight: number;
}

function isPublisher(component: AnyComponent): component is AnyComponent & LoadPublisherInterface {
  return typeof (component as Partial<LoadPublisherInterface>).subscribe === "function";
}

function isSubscriber(component: AnyComponent): component is AnyComponent & LoadSubscriberInterface {
  return typeof (component as Partial<LoadSubscriberInterface>).onLoadReceived === "function";
}

export class SimulationEngine {
  private nodes = new Map<NodeId, AnyComponent>();
  private edgeRecords = new Map<EdgeId, EdgeRecord>();
  private entryPointId: NodeId | null = null;
  private listeners = new Set<() => void>();

  addNode(component: AnyComponent): void {
    if (component.type === "entryPoint") {
      if (this.entryPointId !== null) {
        throw new Error("Only one Entry Point is allowed per graph");
      }
      this.entryPointId = component.nodeId;
    }
    this.nodes.set(component.nodeId, component);
    this.notify();
  }

  removeNode(nodeId: NodeId): void {
    for (const [edgeId, record] of Array.from(this.edgeRecords.entries())) {
      if (record.sourceId === nodeId || record.targetId === nodeId) {
        this.removeEdge(edgeId);
      }
    }
    if (nodeId === this.entryPointId) this.entryPointId = null;
    this.nodes.delete(nodeId);
    this.notify();
  }

  addEdge(sourceId: NodeId, targetId: NodeId, edgeId: EdgeId, weight = 100): void {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) throw new Error("Unknown node referenced in edge");
    if (!isPublisher(source)) throw new Error(`${source.type} cannot have outgoing edges`);
    if (!isSubscriber(target)) throw new Error(`${target.type} cannot have incoming edges`);
    if (!target.canAcceptUpstream(source.type)) {
      throw new Error(`${target.type} cannot accept upstream of type ${source.type}`);
    }
    if (this.wouldCreateCycle(sourceId, targetId)) {
      throw new Error("Adding this edge would create a cycle");
    }
    source.subscribe(target, { edgeId, targetId, weight });
    this.edgeRecords.set(edgeId, { sourceId, targetId, weight });
    this.notify();
  }

  removeEdge(edgeId: EdgeId): void {
    const record = this.edgeRecords.get(edgeId);
    if (!record) return;
    const source = this.nodes.get(record.sourceId);
    if (source && isPublisher(source)) source.unsubscribe(record.targetId);
    this.edgeRecords.delete(edgeId);
    this.notify();
  }

  canConnect(sourceId: NodeId, targetId: NodeId): boolean {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return false;
    if (!isPublisher(source) || !isSubscriber(target)) return false;
    if (!target.canAcceptUpstream(source.type)) return false;
    return !this.wouldCreateCycle(sourceId, targetId);
  }

  private wouldCreateCycle(sourceId: NodeId, targetId: NodeId): boolean {
    if (sourceId === targetId) return true;
    const stack: NodeId[] = [targetId];
    const visited = new Set<NodeId>();
    while (stack.length > 0) {
      const current = stack.pop() as NodeId;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const record of this.edgeRecords.values()) {
        if (record.sourceId === current) stack.push(record.targetId);
      }
    }
    return false;
  }

  start(): void {
    const entryPoint = this.getEntryPoint();
    entryPoint?.startClock(undefined, () => this.notify());
  }

  pause(): void {
    this.getEntryPoint()?.stopClock();
  }

  tick(): void {
    this.getEntryPoint()?.tick();
    this.notify();
  }

  private getEntryPoint(): EntryPointComponent | undefined {
    const entryPoint = this.entryPointId ? this.nodes.get(this.entryPointId) : undefined;
    return entryPoint instanceof EntryPointComponent ? entryPoint : undefined;
  }

  getSnapshot(): EngineSnapshot {
    const nodes: EngineSnapshot["nodes"] = {};
    const edgeLoads: EngineSnapshot["edgeLoads"] = {};

    for (const component of this.nodes.values()) {
      nodes[component.nodeId] = component.getSnapshot();
      if (isPublisher(component) && "getLastDispatch" in component) {
        const dispatch = (component as { getLastDispatch(): ReadonlyMap<EdgeId, number> }).getLastDispatch();
        for (const [edgeId, amount] of dispatch) edgeLoads[edgeId] = amount;
      }
    }

    return { nodes, edgeLoads };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getNode(nodeId: NodeId): AnyComponent | undefined {
    return this.nodes.get(nodeId);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- SimulationEngine`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/SimulationEngine.ts src/engine/SimulationEngine.test.ts
git commit -m "feat(engine): add SimulationEngine graph orchestration"
```

---

## Task 12: Persistence (Export/Import JSON)

**Files:**
- Create: `src/engine/persistence.ts`
- Test: `src/engine/persistence.test.ts`

**Interfaces:**
- Consumes: `ComponentType`, `NodeId`, `EdgeId` (Task 2).
- Produces: `SimulationGraph`, `SimulationGraphNode`, `SimulationGraphEdge` types; `simulationGraphSchema` (zod); `serializeGraph`, `deserializeGraph`. Consumed by the Export/Import UI (Task 20).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { serializeGraph, deserializeGraph } from "./persistence";
import type { SimulationGraphEdge, SimulationGraphNode } from "./persistence";

const sampleNodes: SimulationGraphNode[] = [
  { nodeId: "entry", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 50 } },
  { nodeId: "cdn", type: "cdn", position: { x: 100, y: 0 }, config: { capacity: 200, queueDepth: 0, cacheHitRatio: 0.8 } },
];
const sampleEdges: SimulationGraphEdge[] = [{ edgeId: "e1", sourceId: "entry", targetId: "cdn", weight: 100 }];

describe("persistence", () => {
  it("round-trips a graph through serialize/deserialize unchanged", () => {
    const json = serializeGraph(sampleNodes, sampleEdges);
    const parsed = deserializeGraph(json);
    expect(parsed.nodes).toEqual(sampleNodes);
    expect(parsed.edges).toEqual(sampleEdges);
    expect(parsed.version).toBe(1);
  });

  it("rejects JSON with an unknown component type", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [{ nodeId: "n1", type: "mysteryBox", position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    });
    expect(() => deserializeGraph(badJson)).toThrow();
  });

  it("rejects JSON missing required fields", () => {
    const badJson = JSON.stringify({ version: 1, nodes: [{ nodeId: "n1" }], edges: [] });
    expect(() => deserializeGraph(badJson)).toThrow();
  });

  it("rejects JSON that is not valid JSON at all", () => {
    expect(() => deserializeGraph("{not json")).toThrow();
  });

  it("rejects an edge referencing a node ID that is not in the nodes list", () => {
    const json = serializeGraph(sampleNodes, [{ edgeId: "eBad", sourceId: "entry", targetId: "doesNotExist", weight: 100 }]);
    expect(() => assertEdgesReferenceKnownNodes(deserializeGraph(json))).toThrow();
  });

  it("rejects a graph with more than one entryPoint node", () => {
    const twoEntryNodes: SimulationGraphNode[] = [
      ...sampleNodes,
      { nodeId: "entry2", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
    ];
    const json = serializeGraph(twoEntryNodes, sampleEdges);
    expect(() => assertSingleEntryPoint(deserializeGraph(json))).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- persistence`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/engine/persistence.ts`**

```ts
import { z } from "zod";
import type { ComponentType, EdgeId, NodeId } from "./types";

export interface SimulationGraphNode {
  nodeId: NodeId;
  type: ComponentType;
  position: { x: number; y: number };
  config: Record<string, number>;
}

export interface SimulationGraphEdge {
  edgeId: EdgeId;
  sourceId: NodeId;
  targetId: NodeId;
  weight: number;
}

export interface SimulationGraph {
  version: 1;
  nodes: SimulationGraphNode[];
  edges: SimulationGraphEdge[];
}

const nodeSchema = z.object({
  nodeId: z.string(),
  type: z.enum(["entryPoint", "cdn", "loadBalancer", "application", "cache", "database"]),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.number()),
});

const edgeSchema = z.object({
  edgeId: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  weight: z.number(),
});

export const simulationGraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

export function serializeGraph(nodes: SimulationGraphNode[], edges: SimulationGraphEdge[]): string {
  const graph: SimulationGraph = { version: 1, nodes, edges };
  return JSON.stringify(graph, null, 2);
}

export function deserializeGraph(json: string): SimulationGraph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid simulation graph: not valid JSON");
  }

  const result = simulationGraphSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid simulation graph: ${result.error.message}`);
  }
  return result.data;
}

export function assertEdgesReferenceKnownNodes(graph: SimulationGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      throw new Error(`Edge ${edge.edgeId} references an unknown node`);
    }
  }
}

export function assertSingleEntryPoint(graph: SimulationGraph): void {
  const entryPoints = graph.nodes.filter((node) => node.type === "entryPoint");
  if (entryPoints.length !== 1) {
    throw new Error(`Expected exactly one entryPoint node, found ${entryPoints.length}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- persistence`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/persistence.ts src/engine/persistence.test.ts
git commit -m "feat(engine): add JSON export/import persistence with zod validation"
```

---

## Task 13: UI Foundations — React Flow Canvas Skeleton & useEngineSnapshot

**Files:**
- Create: `src/ui/hooks/useEngineSnapshot.ts`
- Create: `src/ui/canvas/SimulaloadCanvas.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/hooks/useEngineSnapshot.test.ts`
- Test: `src/ui/canvas/SimulaloadCanvas.test.tsx`

**Interfaces:**
- Consumes: `SimulationEngine` (Task 11).
- Produces: `useEngineSnapshot(engine)` hook and `<SimulaloadCanvas engine={engine} />` component, used by every remaining UI task.

- [ ] **Step 1: Write the failing test for `useEngineSnapshot`**

```tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEngineSnapshot } from "./useEngineSnapshot";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { EntryPointComponent } from "../../engine/components/EntryPointComponent";

describe("useEngineSnapshot", () => {
  it("returns the current snapshot and re-renders after a manual tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(new EntryPointComponent("entry", { targetRps: 42 }));

    const { result } = renderHook(() => useEngineSnapshot(engine));
    expect(result.current.nodes["entry"].currentRps).toBe(0);

    act(() => engine.tick());

    expect(result.current.nodes["entry"].currentRps).toBe(42);
  });
});
```

- [ ] **Step 2: Write the failing test for `SimulaloadCanvas`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";

describe("SimulaloadCanvas", () => {
  it("renders an empty canvas without crashing", () => {
    const engine = new SimulationEngine();
    render(<SimulaloadCanvas engine={engine} />);
    expect(screen.getByTestId("simulaload-canvas")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- useEngineSnapshot SimulaloadCanvas`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/ui/hooks/useEngineSnapshot.ts`**

```ts
import { useSyncExternalStore } from "react";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { EngineSnapshot } from "../../engine/types";

export function useEngineSnapshot(engine: SimulationEngine): EngineSnapshot {
  return useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.getSnapshot(),
  );
}
```

- [ ] **Step 5: Implement `src/ui/canvas/SimulaloadCanvas.tsx`**

```tsx
import { ReactFlow, Background, Controls, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { SimulationEngine } from "../../engine/SimulationEngine";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
}

export function SimulaloadCanvas({ engine: _engine }: SimulaloadCanvasProps) {
  return (
    <div data-testid="simulaload-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into `src/App.tsx`**

Replace the scaffold's default content with:

```tsx
import { SimulationEngine } from "./engine/SimulationEngine";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";

const engine = new SimulationEngine();

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SimulaloadCanvas engine={engine} />
    </div>
  );
}

export default App;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- useEngineSnapshot SimulaloadCanvas`
Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add src/ui/hooks/useEngineSnapshot.ts src/ui/canvas/SimulaloadCanvas.tsx src/App.tsx src/ui/hooks/useEngineSnapshot.test.ts src/ui/canvas/SimulaloadCanvas.test.tsx
git commit -m "feat(ui): add React Flow canvas skeleton and useEngineSnapshot bridge"
```

---

## Task 14: Toolbox — Add Components to the Graph

**Files:**
- Create: `src/ui/toolbox/Toolbox.tsx`
- Create: `src/engine/factory.ts`
- Modify: `src/ui/canvas/SimulaloadCanvas.tsx`
- Modify: `src/App.tsx`
- Test: `src/engine/factory.test.ts`
- Test: `src/ui/toolbox/Toolbox.test.tsx`

**Interfaces:**
- Consumes: `SimulationEngine` (Task 11), all six component classes (Tasks 7–10).
- Produces: `createComponent(type, nodeId, overrides?)` factory (default configs per type); `<Toolbox onAdd={(type) => void} />`. Consumed by `App.tsx` and later the Inspector (Task 17, for default config field lists).

- [ ] **Step 1: Write the failing test for the factory**

```ts
import { describe, it, expect } from "vitest";
import { createComponent } from "./factory";
import { CdnComponent } from "./components/CdnComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";

describe("createComponent", () => {
  it("creates a component of the requested type with sensible defaults", () => {
    const cdn = createComponent("cdn", "cdn1");
    expect(cdn).toBeInstanceOf(CdnComponent);
    expect(cdn.getConfig()).toMatchObject({ capacity: 100, cacheHitRatio: 0.7 });
  });

  it("applies config overrides on top of the defaults", () => {
    const db = createComponent("database", "db1", { capacity: 500 });
    expect(db).toBeInstanceOf(DatabaseComponent);
    expect((db as DatabaseComponent).getConfig().capacity).toBe(500);
  });
});
```

- [ ] **Step 2: Write the failing test for `Toolbox`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toolbox } from "./Toolbox";

describe("Toolbox", () => {
  it("calls onAdd with the component type when a palette button is clicked", async () => {
    const onAdd = vi.fn();
    render(<Toolbox onAdd={onAdd} />);

    await userEvent.click(screen.getByRole("button", { name: /load balancer/i }));

    expect(onAdd).toHaveBeenCalledWith("loadBalancer");
  });

  it("does not render a button for Entry Point (it is pinned, not user-addable)", () => {
    render(<Toolbox onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /entry point/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- factory Toolbox`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/engine/factory.ts`**

```ts
import { CdnComponent } from "./components/CdnComponent";
import { LoadBalancerComponent } from "./components/LoadBalancerComponent";
import { ApplicationComponent } from "./components/ApplicationComponent";
import { CacheComponent } from "./components/CacheComponent";
import { DatabaseComponent } from "./components/DatabaseComponent";
import { EntryPointComponent } from "./components/EntryPointComponent";
import type { AnyComponent } from "./SimulationEngine";
import type {
  ApplicationConfig,
  CacheConfig,
  CdnConfig,
  ComponentType,
  DatabaseConfig,
  EntryPointConfig,
  LoadBalancerConfig,
  NodeId,
} from "./types";

type ConfigForType = {
  entryPoint: EntryPointConfig;
  cdn: CdnConfig;
  loadBalancer: LoadBalancerConfig;
  application: ApplicationConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
};

const defaultConfigs: ConfigForType = {
  entryPoint: { targetRps: 50 },
  cdn: { capacity: 100, queueDepth: 10, cacheHitRatio: 0.7 },
  loadBalancer: { capacity: 500, queueDepth: 20 },
  application: { capacity: 100, queueDepth: 10 },
  cache: { capacity: 200, queueDepth: 10, hitRatio: 0.6 },
  database: { capacity: 80, queueDepth: 5 },
};

export function createComponent<T extends ComponentType>(
  type: T,
  nodeId: NodeId,
  overrides?: Partial<ConfigForType[T]>,
): AnyComponent {
  const config = { ...defaultConfigs[type], ...overrides } as ConfigForType[T];
  switch (type) {
    case "entryPoint":
      return new EntryPointComponent(nodeId, config as EntryPointConfig);
    case "cdn":
      return new CdnComponent(nodeId, config as CdnConfig);
    case "loadBalancer":
      return new LoadBalancerComponent(nodeId, config as LoadBalancerConfig);
    case "application":
      return new ApplicationComponent(nodeId, config as ApplicationConfig);
    case "cache":
      return new CacheComponent(nodeId, config as CacheConfig);
    case "database":
      return new DatabaseComponent(nodeId, config as DatabaseConfig);
    default:
      throw new Error(`Unknown component type: ${type}`);
  }
}
```

- [ ] **Step 5: Implement `src/ui/toolbox/Toolbox.tsx`**

```tsx
import type { ComponentType } from "../../engine/types";

interface ToolboxProps {
  onAdd: (type: ComponentType) => void;
}

const addableTypes: { type: ComponentType; label: string }[] = [
  { type: "cdn", label: "CDN" },
  { type: "loadBalancer", label: "Load Balancer" },
  { type: "application", label: "Application" },
  { type: "cache", label: "Cache" },
  { type: "database", label: "Database" },
];

export function Toolbox({ onAdd }: ToolboxProps) {
  return (
    <div data-testid="toolbox">
      {addableTypes.map(({ type, label }) => (
        <button key={type} type="button" onClick={() => onAdd(type)}>
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Wire `Toolbox` and node creation into `App.tsx`**

```tsx
import { useCallback, useState } from "react";
import { SimulationEngine } from "./engine/SimulationEngine";
import { createComponent } from "./engine/factory";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";
import { Toolbox } from "./ui/toolbox/Toolbox";
import type { ComponentType } from "./engine/types";

const engine = new SimulationEngine();
let nextId = 1;

function App() {
  const [, setVersion] = useState(0);

  const handleAdd = useCallback((type: ComponentType) => {
    const nodeId = `${type}-${nextId++}`;
    engine.addNode(createComponent(type, nodeId));
    setVersion((v) => v + 1);
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      <Toolbox onAdd={handleAdd} />
      <SimulaloadCanvas engine={engine} />
    </div>
  );
}

export default App;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- factory Toolbox`
Expected: 4 passed.

- [ ] **Step 8: Commit**

```bash
git add src/engine/factory.ts src/engine/factory.test.ts src/ui/toolbox src/App.tsx
git commit -m "feat(ui): add component factory and clickable Toolbox"
```

---

## Task 15: Custom Node Renderers with Live Meters

**Files:**
- Create: `src/ui/canvas/nodeTypes.tsx`
- Modify: `src/ui/canvas/SimulaloadCanvas.tsx`
- Test: `src/ui/canvas/nodeTypes.test.tsx`

**Interfaces:**
- Consumes: `NodeMetricsSnapshot` (Task 2).
- Produces: `ComponentNode` React Flow custom node component and a `nodeTypes` map, registered on the canvas; `data.snapshot: NodeMetricsSnapshot` is the contract the canvas must feed into each React Flow node.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComponentNode } from "./nodeTypes";
import type { NodeMetricsSnapshot } from "../../engine/types";

const baseSnapshot: NodeMetricsSnapshot = {
  nodeId: "app1",
  type: "application",
  currentRps: 80,
  utilization: 0.8,
  queueLength: 0,
  droppedThisTick: 0,
  droppedTotal: 0,
  status: "degraded",
};

describe("ComponentNode", () => {
  it("renders the component type label and current RPS", () => {
    render(<ComponentNode data={{ snapshot: baseSnapshot }} id="app1" type="application" />);
    expect(screen.getByText(/application/i)).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it("reflects overloaded status with a distinct visual class", () => {
    const overloaded = { ...baseSnapshot, status: "overloaded" as const };
    render(<ComponentNode data={{ snapshot: overloaded }} id="app1" type="application" />);
    expect(screen.getByTestId("component-node")).toHaveClass("status-overloaded");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- nodeTypes`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/ui/canvas/nodeTypes.tsx`**

```tsx
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeMetricsSnapshot } from "../../engine/types";

export interface ComponentNodeData {
  snapshot: NodeMetricsSnapshot;
  [key: string]: unknown;
}

export function ComponentNode({ data }: NodeProps & { data: ComponentNodeData }) {
  const { snapshot } = data;
  const utilizationPercent = Math.min(100, Math.round(snapshot.utilization * 100));

  return (
    <div data-testid="component-node" className={`component-node status-${snapshot.status}`}>
      <Handle type="target" position={Position.Left} />
      <div className="component-node__label">{snapshot.type}</div>
      <div className="component-node__rps">{Math.round(snapshot.currentRps)} rps</div>
      <div className="component-node__bar">
        <div className="component-node__bar-fill" style={{ width: `${utilizationPercent}%` }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = {
  entryPoint: ComponentNode,
  cdn: ComponentNode,
  loadBalancer: ComponentNode,
  application: ComponentNode,
  cache: ComponentNode,
  database: ComponentNode,
};
```

- [ ] **Step 4: Register `nodeTypes` in `src/ui/canvas/SimulaloadCanvas.tsx`**

```tsx
import { ReactFlow, Background, Controls, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodeTypes";
import type { SimulationEngine } from "../../engine/SimulationEngine";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
}

export function SimulaloadCanvas({ engine: _engine }: SimulaloadCanvasProps) {
  return (
    <div data-testid="simulaload-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <ReactFlow nodes={[]} edges={[]} nodeTypes={nodeTypes} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

(Full data wiring — turning `engine.getSnapshot()` into actual React Flow `nodes` — happens in Task 16, once edges and connection validation are also in place, so node and edge state can be built together.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- nodeTypes`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/canvas/nodeTypes.tsx src/ui/canvas/SimulaloadCanvas.tsx src/ui/canvas/nodeTypes.test.tsx
git commit -m "feat(ui): add custom node renderer with live utilization meter"
```

---

## Task 16: Graph State Wiring, Connection Validation & Edge Creation

**Files:**
- Modify: `src/ui/canvas/SimulaloadCanvas.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/canvas/SimulaloadCanvas.test.tsx`

**Interfaces:**
- Consumes: `SimulationEngine.canConnect`, `addEdge`, `getSnapshot` (Task 11); `useEngineSnapshot` (Task 13); `ComponentNodeData` (Task 15).
- Produces: a fully wired canvas where dropped/clicked nodes appear, dragged connections are validated live against `canConnect` and call `engine.addEdge` on success. Consumed by Tasks 17–20 (inspector, summary, edges, persistence all read/write through this same state).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";

describe("SimulaloadCanvas", () => {
  it("renders a React Flow node for each node added to the engine", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("cdn", "cdn1"));

    render(<SimulaloadCanvas engine={engine} nodePositions={{ entry1: { x: 0, y: 0 }, cdn1: { x: 200, y: 0 } }} />);

    expect(screen.getByText(/entryPoint/i)).toBeInTheDocument();
    expect(screen.getByText(/cdn/i)).toBeInTheDocument();
  });

  it("re-renders node RPS labels after a manual engine tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 77 }));

    render(<SimulaloadCanvas engine={engine} nodePositions={{ entry1: { x: 0, y: 0 } }} />);
    act(() => engine.tick());

    expect(screen.getByText(/77/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- SimulaloadCanvas`
Expected: FAIL — `nodePositions` prop not yet supported, nodes not rendered from the engine.

- [ ] **Step 3: Implement the full `src/ui/canvas/SimulaloadCanvas.tsx`**

```tsx
import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  type Connection,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodeTypes";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface SimulaloadCanvasProps {
  engine: SimulationEngine;
  nodePositions: Record<NodeId, { x: number; y: number }>;
}

export function SimulaloadCanvas({ engine, nodePositions }: SimulaloadCanvasProps) {
  const snapshot = useEngineSnapshot(engine);

  const nodes = useMemo(
    () =>
      Object.values(snapshot.nodes).map((nodeSnapshot) => ({
        id: nodeSnapshot.nodeId,
        type: nodeSnapshot.type,
        position: nodePositions[nodeSnapshot.nodeId] ?? { x: 0, y: 0 },
        data: { snapshot: nodeSnapshot },
      })),
    [snapshot, nodePositions],
  );

  const edges = useMemo(() => {
    const edgeEntries: { id: string; source: string; target: string }[] = [];
    for (const edgeId of Object.keys(snapshot.edgeLoads)) {
      edgeEntries.push({ id: edgeId, source: "", target: "" }); // source/target filled by App.tsx edge registry in Task 19
    }
    return edgeEntries;
  }, [snapshot]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const source = "source" in connection ? connection.source : undefined;
      const target = "target" in connection ? connection.target : undefined;
      if (!source || !target) return false;
      return engine.canConnect(source, target);
    },
    [engine],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edgeId = `${connection.source}->${connection.target}`;
      engine.addEdge(connection.source, connection.target, edgeId);
    },
    [engine],
  );

  return (
    <div data-testid="simulaload-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          isValidConnection={isValidConnection}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 4: Update `src/App.tsx` to track node positions and pass them down**

```tsx
import { useCallback, useState } from "react";
import { SimulationEngine } from "./engine/SimulationEngine";
import { createComponent } from "./engine/factory";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";
import { Toolbox } from "./ui/toolbox/Toolbox";
import type { ComponentType, NodeId } from "./engine/types";

const engine = new SimulationEngine();
let nextId = 1;

function App() {
  const [positions, setPositions] = useState<Record<NodeId, { x: number; y: number }>>({});

  const handleAdd = useCallback((type: ComponentType) => {
    const nodeId = `${type}-${nextId++}`;
    engine.addNode(createComponent(type, nodeId));
    setPositions((prev) => ({ ...prev, [nodeId]: { x: 100 + nextId * 20, y: 100 } }));
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      <Toolbox onAdd={handleAdd} />
      <SimulaloadCanvas engine={engine} nodePositions={positions} />
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- SimulaloadCanvas`
Expected: 3 passed (including the Task 13 smoke test).

- [ ] **Step 6: Commit**

```bash
git add src/ui/canvas/SimulaloadCanvas.tsx src/App.tsx src/ui/canvas/SimulaloadCanvas.test.tsx
git commit -m "feat(ui): wire canvas nodes to engine snapshot and validate connections live"
```

---

## Task 17: Inspector Panel

**Files:**
- Create: `src/ui/inspector/InspectorPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/ui/inspector/InspectorPanel.test.tsx`

**Interfaces:**
- Consumes: `AnyComponent`, `SimulationEngine.getNode` (Task 11); `ConfigurableInterface` (every component, Tasks 7–10).
- Produces: `<InspectorPanel engine={engine} selectedNodeId={id | null} />`, rendering the right fields per `ComponentType` and calling `setConfig` immediately on change.

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InspectorPanel } from "./InspectorPanel";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";
import { CdnComponent } from "../../engine/components/CdnComponent";

describe("InspectorPanel", () => {
  it("renders nothing when no node is selected", () => {
    const engine = new SimulationEngine();
    render(<InspectorPanel engine={engine} selectedNodeId={null} />);
    expect(screen.queryByTestId("inspector-panel")).not.toBeInTheDocument();
  });

  it("renders CDN fields for a selected CDN node and applies edits immediately", async () => {
    const engine = new SimulationEngine();
    const cdn = createComponent("cdn", "cdn1") as CdnComponent;
    engine.addNode(cdn);

    render(<InspectorPanel engine={engine} selectedNodeId="cdn1" />);

    const hitRatioInput = screen.getByLabelText(/cache hit ratio/i);
    await userEvent.clear(hitRatioInput);
    await userEvent.type(hitRatioInput, "0.5");

    expect(cdn.getConfig().cacheHitRatio).toBeCloseTo(0.5, 5);
  });

  it("renders the live-adjustable targetRps slider for the Entry Point", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));

    render(<InspectorPanel engine={engine} selectedNodeId="entry1" />);

    expect(screen.getByLabelText(/target rps/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- InspectorPanel`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/ui/inspector/InspectorPanel.tsx`**

```tsx
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface InspectorPanelProps {
  engine: SimulationEngine;
  selectedNodeId: NodeId | null;
}

interface NumericField {
  key: string;
  label: string;
  step?: number;
}

const fieldsByType: Record<string, NumericField[]> = {
  entryPoint: [{ key: "targetRps", label: "Target RPS", step: 1 }],
  cdn: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
    { key: "cacheHitRatio", label: "Cache Hit Ratio", step: 0.01 },
  ],
  loadBalancer: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
  application: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
  cache: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
    { key: "hitRatio", label: "Hit Ratio", step: 0.01 },
  ],
  database: [
    { key: "capacity", label: "Capacity (RPS)", step: 1 },
    { key: "queueDepth", label: "Queue Depth", step: 1 },
  ],
};

export function InspectorPanel({ engine, selectedNodeId }: InspectorPanelProps) {
  if (!selectedNodeId) return null;

  const node = engine.getNode(selectedNodeId);
  if (!node) return null;

  const fields = fieldsByType[node.type] ?? [];
  const config = node.getConfig() as Record<string, number>;

  return (
    <div data-testid="inspector-panel">
      <h3>{node.type}</h3>
      {fields.map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            type="number"
            step={field.step ?? 1}
            value={config[field.key]}
            onChange={(event) => {
              const value = Number(event.target.value);
              node.setConfig({ [field.key]: value } as never);
            }}
          />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire selection state into `src/App.tsx`**

Add `const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);`, pass `onNodeClick={(_, node) => setSelectedNodeId(node.id)}` to `SimulaloadCanvas`'s underlying `<ReactFlow>` (forward it as a prop in Task 16's component, or thread it through — threading: add an `onNodeClick` prop to `SimulaloadCanvasProps` and forward it to `<ReactFlow onNodeClick={onNodeClick} ...>`), and render `<InspectorPanel engine={engine} selectedNodeId={selectedNodeId} />` alongside the canvas.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- InspectorPanel`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/inspector/InspectorPanel.tsx src/ui/canvas/SimulaloadCanvas.tsx src/App.tsx src/ui/inspector/InspectorPanel.test.tsx
git commit -m "feat(ui): add Inspector panel with immediate live config edits"
```

---

## Task 18: Global Summary Bar

**Files:**
- Create: `src/ui/summary/SummaryBar.tsx`
- Create: `src/ui/summary/computeSummary.ts`
- Modify: `src/App.tsx`
- Test: `src/ui/summary/computeSummary.test.ts`
- Test: `src/ui/summary/SummaryBar.test.tsx`

**Interfaces:**
- Consumes: `EngineSnapshot`, `NodeMetricsSnapshot` (Task 2).
- Produces: `computeSummary(snapshot): { totalIn: number; totalDropped: number; successRatePercent: number }`; `<SummaryBar snapshot={snapshot} />`.

- [ ] **Step 1: Write the failing tests for `computeSummary`**

```ts
import { describe, it, expect } from "vitest";
import { computeSummary } from "./computeSummary";
import type { EngineSnapshot } from "../../engine/types";

function snapshotWith(nodes: EngineSnapshot["nodes"]): EngineSnapshot {
  return { nodes, edgeLoads: {} };
}

describe("computeSummary", () => {
  it("sums the entry point's RPS as totalIn and all nodes' droppedThisTick as totalDropped", () => {
    const snapshot = snapshotWith({
      entry: { nodeId: "entry", type: "entryPoint", currentRps: 100, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "healthy" },
      app: { nodeId: "app", type: "application", currentRps: 80, utilization: 0.8, queueLength: 0, droppedThisTick: 20, droppedTotal: 20, status: "overloaded" },
    });

    const summary = computeSummary(snapshot);

    expect(summary.totalIn).toBe(100);
    expect(summary.totalDropped).toBe(20);
    expect(summary.successRatePercent).toBe(80);
  });

  it("reports 100% success and no NaN when totalIn is zero", () => {
    const snapshot = snapshotWith({
      entry: { nodeId: "entry", type: "entryPoint", currentRps: 0, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "idle" },
    });

    const summary = computeSummary(snapshot);

    expect(summary.successRatePercent).toBe(100);
    expect(Number.isNaN(summary.successRatePercent)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing test for `SummaryBar`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryBar } from "./SummaryBar";
import type { EngineSnapshot } from "../../engine/types";

describe("SummaryBar", () => {
  it("renders totalIn, totalDropped, and successRatePercent", () => {
    const snapshot: EngineSnapshot = {
      nodes: {
        entry: { nodeId: "entry", type: "entryPoint", currentRps: 100, utilization: 0, queueLength: 0, droppedThisTick: 0, droppedTotal: 0, status: "healthy" },
      },
      edgeLoads: {},
    };

    render(<SummaryBar snapshot={snapshot} />);

    expect(screen.getByText(/100/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- computeSummary SummaryBar`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/ui/summary/computeSummary.ts`**

```ts
import type { EngineSnapshot } from "../../engine/types";

export interface Summary {
  totalIn: number;
  totalDropped: number;
  successRatePercent: number;
}

export function computeSummary(snapshot: EngineSnapshot): Summary {
  const nodes = Object.values(snapshot.nodes);
  const entryPoint = nodes.find((node) => node.type === "entryPoint");
  const totalIn = entryPoint?.currentRps ?? 0;
  const totalDropped = nodes.reduce((sum, node) => sum + node.droppedThisTick, 0);
  const successRatePercent = totalIn <= 0 ? 100 : Math.max(0, ((totalIn - totalDropped) / totalIn) * 100);

  return { totalIn, totalDropped, successRatePercent };
}
```

- [ ] **Step 5: Implement `src/ui/summary/SummaryBar.tsx`**

```tsx
import { computeSummary } from "./computeSummary";
import type { EngineSnapshot } from "../../engine/types";

interface SummaryBarProps {
  snapshot: EngineSnapshot;
}

export function SummaryBar({ snapshot }: SummaryBarProps) {
  const summary = computeSummary(snapshot);
  return (
    <div data-testid="summary-bar">
      <span>In: {Math.round(summary.totalIn)} rps</span>
      <span>Dropped: {Math.round(summary.totalDropped)} rps</span>
      <span>Success: {summary.successRatePercent.toFixed(1)}%</span>
    </div>
  );
}
```

- [ ] **Step 6: Wire `SummaryBar` into `src/App.tsx`**

Add `const snapshot = useEngineSnapshot(engine);` at the top of `App` and render `<SummaryBar snapshot={snapshot} />` above the canvas/toolbox row.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- computeSummary SummaryBar`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add src/ui/summary src/App.tsx
git commit -m "feat(ui): add global summary bar with aggregate load stats"
```

---

## Task 19: Animated Edge Styling

**Files:**
- Create: `src/ui/canvas/computeEdgeStyle.ts`
- Modify: `src/ui/canvas/SimulaloadCanvas.tsx`
- Test: `src/ui/canvas/computeEdgeStyle.test.ts`

**Interfaces:**
- Consumes: `EngineSnapshot.edgeLoads` (Task 2).
- Produces: `computeEdgeStyle(load, maxLoad): { strokeWidth: number; opacity: number; animated: boolean }`, applied per-edge in `SimulaloadCanvas`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeEdgeStyle } from "./computeEdgeStyle";

describe("computeEdgeStyle", () => {
  it("scales stroke width and opacity between a floor and ceiling based on load ratio", () => {
    const noLoad = computeEdgeStyle(0, 100);
    const halfLoad = computeEdgeStyle(50, 100);
    const fullLoad = computeEdgeStyle(100, 100);

    expect(noLoad.strokeWidth).toBeLessThan(halfLoad.strokeWidth);
    expect(halfLoad.strokeWidth).toBeLessThan(fullLoad.strokeWidth);
    expect(noLoad.animated).toBe(false);
    expect(fullLoad.animated).toBe(true);
  });

  it("never divides by zero when maxLoad is zero", () => {
    const style = computeEdgeStyle(0, 0);
    expect(Number.isNaN(style.strokeWidth)).toBe(false);
    expect(Number.isNaN(style.opacity)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- computeEdgeStyle`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/ui/canvas/computeEdgeStyle.ts`**

```ts
export interface EdgeStyle {
  strokeWidth: number;
  opacity: number;
  animated: boolean;
}

const MIN_STROKE = 1;
const MAX_STROKE = 6;
const MIN_OPACITY = 0.3;
const MAX_OPACITY = 1;

export function computeEdgeStyle(load: number, maxLoad: number): EdgeStyle {
  const ratio = maxLoad > 0 ? Math.min(1, Math.max(0, load / maxLoad)) : 0;
  return {
    strokeWidth: MIN_STROKE + ratio * (MAX_STROKE - MIN_STROKE),
    opacity: MIN_OPACITY + ratio * (MAX_OPACITY - MIN_OPACITY),
    animated: ratio > 0,
  };
}
```

- [ ] **Step 4: Apply it in `src/ui/canvas/SimulaloadCanvas.tsx`**

Replace the `edges` memo with one that also tracks source/target (now that edges carry real connections from `onConnect`) and derives style from `computeEdgeStyle`:

```tsx
const edges = useMemo(() => {
  const maxLoad = Math.max(1, ...Object.values(snapshot.edgeLoads));
  return edgeRegistry.map(({ edgeId, source, target }) => {
    const load = snapshot.edgeLoads[edgeId] ?? 0;
    const style = computeEdgeStyle(load, maxLoad);
    return {
      id: edgeId,
      source,
      target,
      animated: style.animated,
      style: { strokeWidth: style.strokeWidth, opacity: style.opacity },
    };
  });
}, [snapshot, edgeRegistry]);
```

Add an `edgeRegistry: { edgeId: string; source: NodeId; target: NodeId }[]` prop to `SimulaloadCanvasProps`, populated by `App.tsx` from the `onConnect` callback (append a record there instead of discarding the connection details), and import `computeEdgeStyle` at the top of the file.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- computeEdgeStyle`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/canvas/computeEdgeStyle.ts src/ui/canvas/SimulaloadCanvas.tsx src/App.tsx src/ui/canvas/computeEdgeStyle.test.ts
git commit -m "feat(ui): animate edges by live load, scaled by stroke width and opacity"
```

---

## Task 20: Export/Import UI

**Files:**
- Create: `src/ui/persistence/PersistenceControls.tsx`
- Create: `src/engine/graphIO.ts`
- Modify: `src/App.tsx`
- Test: `src/engine/graphIO.test.ts`
- Test: `src/ui/persistence/PersistenceControls.test.tsx`

**Interfaces:**
- Consumes: `serializeGraph`, `deserializeGraph`, `assertEdgesReferenceKnownNodes`, `assertSingleEntryPoint` (Task 12); `SimulationEngine` (Task 11); `createComponent` (Task 14).
- Produces: `exportGraph(engine, positions): string`; `importGraph(engine, json): Record<NodeId, {x,y}>` (rebuilds the engine's nodes/edges in place and returns the positions to restore in React state); `<PersistenceControls engine={engine} positions={...} onImported={(positions) => void} />`.

- [ ] **Step 1: Write the failing tests for `graphIO`**

```ts
import { describe, it, expect } from "vitest";
import { exportGraph, importGraph } from "./graphIO";
import { SimulationEngine } from "./SimulationEngine";
import { createComponent } from "./factory";

describe("graphIO", () => {
  it("exports the current graph and re-imports it into a fresh engine with equivalent behavior", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 30 }));
    engine.addNode(createComponent("cdn", "cdn1"));
    engine.addEdge("entry1", "cdn1", "e1");
    const positions = { entry1: { x: 0, y: 0 }, cdn1: { x: 150, y: 0 } };

    const json = exportGraph(engine, positions);

    const freshEngine = new SimulationEngine();
    const restoredPositions = importGraph(freshEngine, json);

    freshEngine.tick();
    expect(freshEngine.getSnapshot().nodes["cdn1"].currentRps).toBe(30);
    expect(restoredPositions.cdn1).toEqual({ x: 150, y: 0 });
  });

  it("throws and does not mutate the target engine when the JSON references an unknown node in an edge", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [{ nodeId: "entry1", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } }],
      edges: [{ edgeId: "e1", sourceId: "entry1", targetId: "missing", weight: 100 }],
    });
    const engine = new SimulationEngine();

    expect(() => importGraph(engine, badJson)).toThrow();
    expect(engine.getNode("entry1")).toBeUndefined();
  });

  it("throws when the JSON contains more than one entryPoint", () => {
    const badJson = JSON.stringify({
      version: 1,
      nodes: [
        { nodeId: "entry1", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
        { nodeId: "entry2", type: "entryPoint", position: { x: 0, y: 0 }, config: { targetRps: 10 } },
      ],
      edges: [],
    });
    const engine = new SimulationEngine();

    expect(() => importGraph(engine, badJson)).toThrow();
  });
});
```

- [ ] **Step 2: Write the failing test for `PersistenceControls`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersistenceControls } from "./PersistenceControls";
import { SimulationEngine } from "../../engine/SimulationEngine";

describe("PersistenceControls", () => {
  it("renders an export button that is enabled even on an empty graph", async () => {
    const engine = new SimulationEngine();
    render(<PersistenceControls engine={engine} positions={{}} onImported={vi.fn()} />);

    const exportButton = screen.getByRole("button", { name: /export/i });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npm test -- graphIO PersistenceControls`
Expected: FAIL — neither module exists.

- [ ] **Step 4: Implement `src/engine/graphIO.ts`**

```ts
import { createComponent } from "./factory";
import { assertEdgesReferenceKnownNodes, assertSingleEntryPoint, deserializeGraph, serializeGraph } from "./persistence";
import type { SimulationEngine } from "./SimulationEngine";
import type { ApplicationConfig, CacheConfig, CdnConfig, ComponentType, DatabaseConfig, EntryPointConfig, LoadBalancerConfig, NodeId } from "./types";

export function exportGraph(engine: SimulationEngine, positions: Record<NodeId, { x: number; y: number }>): string {
  const nodes = Object.keys(positions)
    .map((nodeId) => engine.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => node !== undefined)
    .map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      position: positions[node.nodeId],
      config: node.getConfig() as unknown as Record<string, number>,
    }));

  // Edge weights/connections are read back from the engine's own records via getSnapshot's edgeLoads keys,
  // but edgeLoads only has amounts, not source/target — so edges must be tracked alongside positions by the caller
  // and passed in. This function assumes the caller (PersistenceControls) supplies them through a second export path;
  // see Step 5 of this task for the full caller-side wiring.
  return serializeGraph(nodes, []);
}

export function importGraph(engine: SimulationEngine, json: string): Record<NodeId, { x: number; y: number }> {
  const graph = deserializeGraph(json);
  assertSingleEntryPoint(graph);
  assertEdgesReferenceKnownNodes(graph);

  const positions: Record<NodeId, { x: number; y: number }> = {};
  for (const node of graph.nodes) {
    engine.addNode(createComponent(node.type as ComponentType, node.nodeId, node.config as never));
    positions[node.nodeId] = node.position;
  }
  for (const edge of graph.edges) {
    engine.addEdge(edge.sourceId, edge.targetId, edge.edgeId, edge.weight);
  }
  return positions;
}
```

> Note for the implementer: `exportGraph`'s edge list is intentionally empty above because `SimulationEngine` does not currently expose its edge records publicly. Before finishing this step, add a `getEdges(): { edgeId: EdgeId; sourceId: NodeId; targetId: NodeId; weight: number }[]` method to `SimulationEngine` (Task 11's file) that returns `Array.from(this.edgeRecords.entries()).map(([edgeId, record]) => ({ edgeId, ...record }))`, then use `engine.getEdges()` here to build the real edge list. Add one test to `SimulationEngine.test.ts` asserting `getEdges()` returns the edges added via `addEdge`.

- [ ] **Step 5: Implement `src/ui/persistence/PersistenceControls.tsx`**

```tsx
import { useRef } from "react";
import { exportGraph, importGraph } from "../../engine/graphIO";
import type { SimulationEngine } from "../../engine/SimulationEngine";
import type { NodeId } from "../../engine/types";

interface PersistenceControlsProps {
  engine: SimulationEngine;
  positions: Record<NodeId, { x: number; y: number }>;
  onImported: (positions: Record<NodeId, { x: number; y: number }>) => void;
}

export function PersistenceControls({ engine, positions, onImported }: PersistenceControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportGraph(engine, positions);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "simulaload-graph.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const restoredPositions = importGraph(engine, text);
      onImported(restoredPositions);
    } catch (error) {
      window.alert(`Could not import graph: ${(error as Error).message}`);
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div data-testid="persistence-controls">
      <button type="button" onClick={handleExport}>
        Export
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        Import
      </button>
      <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleImportFile} />
    </div>
  );
}
```

- [ ] **Step 6: Wire `PersistenceControls` into `src/App.tsx`**

Add `<PersistenceControls engine={engine} positions={positions} onImported={setPositions} />` next to the `Toolbox`, and reset `nextId`/state as needed so newly added nodes after an import don't collide with imported IDs (prefix new IDs with a timestamp if simpler: `` `${type}-${Date.now()}-${nextId++}` ``). `onImported` must also rebuild the `edgeRegistry` state introduced in Task 19 (not just `positions`): change its signature to `onImported={(positions) => { setPositions(positions); setEdgeRegistry(engine.getEdges().map(({ edgeId, sourceId, targetId }) => ({ edgeId, source: sourceId, target: targetId }))); }}`, using the `getEdges()` method added to `SimulationEngine` in Step 4 above. Without this, imported edges would be wired in the engine but invisible on the canvas.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- graphIO PersistenceControls`
Expected: 4 passed (3 from `graphIO` + the `getEdges` addition in `SimulationEngine.test.ts`, 1 from `PersistenceControls`).

- [ ] **Step 8: Commit**

```bash
git add src/engine/graphIO.ts src/engine/SimulationEngine.ts src/engine/SimulationEngine.test.ts src/ui/persistence src/App.tsx
git commit -m "feat: add JSON export/import controls wired to the live engine and canvas"
```

---

## Task 21: Manual Verification Pass

**Files:** none (manual QA only — no code changes expected unless a bug is found, in which case fix it in the file it belongs to and re-run the relevant task's automated tests).

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all tests across all 20 previous tasks pass.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 3: Verify the golden path**

1. Click "Load Balancer", "Application", "Cache", "Database" in the Toolbox — confirm four new nodes appear on the canvas, plus the pinned Entry Point.
2. Drag connections: Entry Point → Load Balancer → Application → Cache → Database.
3. Select the Entry Point node, confirm the Target RPS field is visible and editable; set it to 50.
4. Confirm edges animate and each node's utilization bar updates live without reloading the page.
5. Confirm the Summary Bar's "In", "Dropped", and "Success" figures update continuously and never show `NaN`.
6. Click Export, confirm a `simulaload-graph.json` file downloads.
7. Refresh the page (clearing all state), click Import, select the downloaded file, confirm the diagram and its live simulation are fully restored.

- [ ] **Step 4: Verify edge cases**

1. Try dragging a connection from Database to anything — confirm React Flow refuses it (Database has no source handle / `isValidConnection` rejects it).
2. Lower an Application's capacity below the incoming load — confirm its node turns to the "overloaded" visual state and the Summary Bar's dropped count rises.
3. Attempt to import a hand-edited JSON file with an invalid `type` field (e.g. `"typo"`) — confirm the app shows an error alert and does not crash or partially apply the bad graph.
4. Set the Entry Point's Target RPS to `0` — confirm all downstream nodes settle at 0 RPS with no visual glitches or `NaN` displayed anywhere.

- [ ] **Step 5: Record results**

Note any discrepancies from the above in the PR description or a follow-up task; fix anything broken before considering the plan complete.
