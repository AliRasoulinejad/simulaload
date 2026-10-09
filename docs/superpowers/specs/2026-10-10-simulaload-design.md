# Simulaload — Design Spec

Date: 2026-10-10
Status: Approved for implementation planning

## 1. Purpose & Scope

Simulaload is a client-side, drag-and-drop visual tool for modeling how load flows
through a system architecture. Users build a diagram out of infrastructure
components (CDN, Load Balancer, Application, Cache, Database), each with
tunable attributes (capacity, hit ratio, routing weights), and watch a live,
animated simulation of load propagating through the graph from a single fixed
Entry Point. The goal is capacity-planning intuition and teaching, not real
traffic generation — no backend, no real HTTP calls, no accounts.

**Non-goals for v1:** real traffic generation, saved templates, free/paid
tiers, auth/accounts, chaos injection, queues/message brokers, multi-entry-point
graphs, cyclic graphs.

Competitive context (researched during brainstorming): SystemDesignSim,
SystemDecoder, Robust Design, Chinilla, and FlowFrame all converge on the same
core component set (CDN, Load Balancer, API/Application, Database, Cache) with
drag-and-drop canvases and live bottleneck visualization. Netflix's Vizceral
is the visual precedent for animated traffic-flow edges (thickness/color by
volume and health) that this project's canvas styling should emulate.

## 2. High-Level Architecture

Three strictly separated layers:

```
UI Layer (React + React Flow)
  - canvas, custom node renderers, inspector panel, toolbox, summary bar
  - subscribes to engine snapshots via useSyncExternalStore
  - writes graph edits (add/remove node or edge, config changes) into the engine
        |
Simulation Engine (plain TypeScript, zero React dependency)
  - component classes implementing small composable interfaces
  - pub/sub (Observer pattern) load propagation, no central topological sort
  - entry point owns the only internal clock; every other component is purely reactive
        |
Persistence (JSON export/import; no backend, no auto-save, no templates)
```

The engine is fully unit-testable in Node with no DOM. React Flow owns only
visual state (node positions, viewport, selection) and is kept in sync with
the engine's logical graph via node IDs. Swapping the canvas library later
would not require touching engine code.

## 3. Component Types (v1)

Six component types, chosen from competitor research:

1. **Entry Point** — pinned, exactly one per graph, cannot be deleted, no
   incoming edges, exactly one outgoing edge. Generates load at a
   user-adjustable `targetRps`, live-editable while running.
2. **CDN** — capacity + `cacheHitRatio` (0–1). Absorbs the hit fraction,
   forwards the miss fraction down its single outgoing edge.
3. **Load Balancer** — capacity + per-edge weight percentages (sum to 100).
   Splits accepted load across multiple outgoing edges by weight.
4. **Application** — capacity + queue depth. Broadcasts its full accepted
   load down *every* outgoing edge (models a service calling all of its
   declared dependencies per request, not splitting traffic).
5. **Cache** — capacity + `hitRatio` (0–1). Same absorb/forward shape as CDN,
   kept as a distinct type because it sits mid-graph rather than at the edge.
6. **Database** — capacity (`rps`, `tps`) + queue depth. Terminal sink, no
   dispatcher; does not accept outgoing edges.

All non-EntryPoint components share overload behavior: incoming load beyond
`capacity` fills an internal queue up to `queueDepth`; anything beyond
`capacity + queueDepth` is dropped and counted in that node's cumulative
dropped total.

## 4. Component Model — Interface Segregation

Every component composes only the small interfaces it needs; none implement
a single monolithic "processor" interface.

```ts
interface CapacityModelInterface {
  readonly capacity: number;
  readonly queueDepth: number;
  readonly currentQueue: number;
  accept(incoming: number, deltaSeconds: number): { accepted: number; queued: number; dropped: number };
}

interface AbsorptionModelInterface {
  readonly absorptionRatio: number;
  absorb(incoming: number): { absorbed: number; remainder: number };
}

interface DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number>;
}

interface ConfigurableInterface<TConfig> {
  getConfig(): TConfig;
  setConfig(partial: Partial<TConfig>): void;
}

interface MetricsSnapshotInterface {
  getSnapshot(): NodeMetricsSnapshot; // utilization %, queue depth, dropped-this-tick, cumulative dropped, health status
}

interface LoadPublisherInterface {
  subscribe(subscriber: LoadSubscriberInterface, edge: WeightedEdge): void;
  unsubscribe(subscriberId: NodeId): void;
}

interface LoadSubscriberInterface {
  readonly allowedUpstreamTypes: ReadonlySet<ComponentType>;
  canAcceptUpstream(publisherType: ComponentType): boolean;
  onLoadReceived(amount: number, fromNodeId: NodeId): void;
}
```

Dispatch strategies (composed, not hand-rolled per component):
- `WeightedSplitStrategy` — partitions by weight % (Load Balancer).
- `BroadcastStrategy` — sends the full amount down every edge (Application).
- `SingleForwardStrategy` — sends 100% of the one remainder to the one edge (CDN/Cache miss path, Entry Point's only edge).

Component composition:

| Component | Composes |
|---|---|
| `EntryPointComponent` | `LoadPublisherInterface` (+ `SingleForwardStrategy`), `ConfigurableInterface<EntryPointConfig>`, `MetricsSnapshotInterface`, internal clock (`startClock`/`stopClock`). **No** `LoadSubscriberInterface`, **no** `CapacityModelInterface`. |
| `CdnComponent` | `LoadSubscriberInterface`, `CapacityModelInterface`, `AbsorptionModelInterface`, `LoadPublisherInterface` (+ `SingleForwardStrategy`), `ConfigurableInterface`, `MetricsSnapshotInterface` |
| `LoadBalancerComponent` | `LoadSubscriberInterface`, `CapacityModelInterface`, `LoadPublisherInterface` (+ `WeightedSplitStrategy`), `ConfigurableInterface`, `MetricsSnapshotInterface` |
| `ApplicationComponent` | `LoadSubscriberInterface`, `CapacityModelInterface`, `LoadPublisherInterface` (+ `BroadcastStrategy`), `ConfigurableInterface`, `MetricsSnapshotInterface` |
| `CacheComponent` | `LoadSubscriberInterface`, `CapacityModelInterface`, `AbsorptionModelInterface`, `LoadPublisherInterface` (+ `SingleForwardStrategy`), `ConfigurableInterface`, `MetricsSnapshotInterface` |
| `DatabaseComponent` | `LoadSubscriberInterface`, `CapacityModelInterface`, `ConfigurableInterface`, `MetricsSnapshotInterface`. **No** `LoadPublisherInterface` — terminal. |

**Allowed upstream matrix** (enforced by `canAcceptUpstream`, checked both by
the runtime `subscribe()` call and by React Flow's connection validation so
invalid wiring cannot be drawn):

| Component | `allowedUpstreamTypes` |
|---|---|
| CDN | EntryPoint |
| Load Balancer | EntryPoint, CDN |
| Application | EntryPoint, CDN, Load Balancer |
| Cache | Application |
| Database | Application, Cache |

## 5. Simulation Engine — Pub/Sub Propagation

Only `EntryPointComponent` is active (owns a `setInterval`-driven internal
clock, fixed tick rate `deltaSeconds = 0.25s`, not user-configurable in v1).
Every other component is purely reactive: it does nothing until
`onLoadReceived` fires.

**Fan-in handling without a central scheduler:** each non-EntryPoint
component (via a shared `ReactiveComponentBase`) tracks `expectedUpstreamCount`
(the number of edges currently subscribed to it) and a per-tick accumulation
buffer + arrival counter. `onLoadReceived` adds the incoming amount to the
buffer and increments the counter. Once the counter reaches
`expectedUpstreamCount`, the component **flushes**:

1. `CapacityModelInterface.accept(buffer, deltaSeconds)` — capacity/queue gate, drop accounting.
2. `AbsorptionModelInterface.absorb(accepted)` if present — hit/miss split.
3. `DispatchStrategyInterface.computeOutputs(remainder, edges)` if present — compute per-edge amounts.
4. For each output edge, directly call the downstream subscriber's `onLoadReceived(amount, thisNodeId)`.
5. Reset buffer and counter for the next tick.

Because step 4 is a direct synchronous call, propagation cascades recursively
from the Entry Point's single tick, and correct causal ordering (every
upstream flushes before its downstream) falls out of the call chain itself —
no explicit topological sort is needed anywhere in the engine.

**Graph validity**, enforced on every graph edit:
- Exactly one Entry Point; no incoming edges to it; exactly one outgoing edge.
- Graph must be acyclic (rejected at edge-creation time via `canAcceptUpstream`
  plus a cycle check, since the allowed-upstream matrix already makes most
  cycles structurally impossible).
- A component without `LoadPublisherInterface` (Database) cannot have outgoing
  edges — enforced by React Flow connection validation (no source handle
  exposed on that node type).
- Disconnected components (unreachable from Entry Point) are permitted to
  exist in the diagram but simply never receive `onLoadReceived` calls.

**`SimulationEngine` class** responsibilities: owns the set of component
instances and edges, wires `subscribe`/`unsubscribe` calls when the UI edits
the diagram, starts/stops/resets the Entry Point's clock, and exposes
`getSnapshot(): EngineSnapshot` (`{ nodes: Record<NodeId, NodeMetricsSnapshot>, edges: Record<EdgeId, number> }`)
for the UI layer to subscribe to after each tick completes.

## 6. UI Layer

- **React Flow** (`@xyflow/react`) for the canvas: drag-drop, pan/zoom, custom
  node renderers, edge rendering.
- Custom node renderer per `ComponentType`: icon, label, live utilization bar
  (0–100%, green/amber/red), current RPS flowing through it.
- **Connection validation**: `isValidConnection` calls the target's
  `canAcceptUpstream(sourceType)` before allowing a drag-connect.
- **Animated edges**: thickness/opacity scaled to current load (Vizceral-style).
- **Inspector panel**: selecting a node renders form inputs bound to its
  `ConfigurableInterface` fields; edits call `setConfig()` immediately
  (no "apply" step) so the simulation visibly reacts in real time.
- **Toolbox**: draggable palette of the six component types; dropping onto the
  canvas instantiates a new component and registers it with the engine.
- **Global summary bar**: aggregate totals from `EngineSnapshot` — total RPS
  entering the system, total accepted, total dropped, overall success %.
- **React/engine bridge**: a `useEngineSnapshot` hook built on
  `useSyncExternalStore`, subscribing to `EngineSnapshot` emitted after each
  tick. React Flow node `data` is derived from that snapshot each render.

## 7. Persistence

- **Export**: serialize the current graph — per-node `ConfigurableInterface.getConfig()`
  output plus React Flow positions, and all edges with weights — into a
  single `SimulationGraph` JSON schema, downloaded as a `.json` file.
- **Import**: file picker reads JSON, validates shape with `zod`, rejects with
  a clear error on malformed input or unknown component types; on success,
  fully replaces the current graph (rebuilds engine instances and React Flow
  state from scratch, re-subscribing all pub/sub links per the saved edges).
- No auto-save, no backend, no templates, no free/paid gating in v1.

## 8. Testing Strategy

Implementation follows test-first development (per `test-driven-development`).

- **Engine unit tests** (pure TS, no DOM): each component's `accept()` /
  `absorb()` / `computeOutputs()` in isolation — capacity ceiling, queue fill,
  drop accounting, hit/miss split, weighted split, broadcast fan-out.
- **Cascade/integration tests**: wire several components together in-memory,
  drive ticks manually (not real timers), assert end-to-end propagated values
  against hand-computed expectations, including multi-upstream fan-in
  arrival counting.
- **Connection-validity tests**: `canAcceptUpstream` matrix enforcement, cycle
  rejection, Entry Point singleton/edge constraints.
- **Component tests** (React Testing Library): inspector edits reach
  `setConfig()`; node renderers reflect snapshot values correctly.
- No browser e2e automation in v1; a manual dev-server pass verifies the full
  UI once implementation is complete.

## 9. Project Structure & New Dependencies

```
src/
  engine/              # zero React dependency, fully unit-testable
    interfaces.ts        # CapacityModelInterface, AbsorptionModelInterface,
                          # DispatchStrategyInterface, ConfigurableInterface,
                          # MetricsSnapshotInterface, LoadPublisherInterface,
                          # LoadSubscriberInterface
    strategies/           # WeightedSplitStrategy, BroadcastStrategy, SingleForwardStrategy
    components/            # EntryPointComponent, CdnComponent, LoadBalancerComponent,
                           # ApplicationComponent, CacheComponent, DatabaseComponent
    SimulationEngine.ts
    persistence.ts         # serialize/deserialize SimulationGraph
  ui/
    canvas/               # React Flow setup, custom node renderers, edge styling
    inspector/            # per-type config forms
    toolbox/              # draggable component palette
    summary/              # global stats bar
    hooks/                # useEngineSnapshot
  App.tsx
```

New dependencies to add: `@xyflow/react`, `zod`, `vitest`, `@testing-library/react`
(none of these exist in the current scaffold yet).

## 10. Open Items Resolved During Brainstorming

- Pure simulation model, not real traffic generation.
- Animated continuous simulation (not static solve, not timeline scenarios).
- Component set: Entry Point, CDN, Load Balancer, Application, Cache, Database.
- Overload: queue up to a limit, then drop.
- Metrics: per-node live meters + global summary bar.
- Persistence: export/import JSON only; no auto-save, no templates, no
  paid-tier gating in v1.
- Fan-out is type-specific: Load Balancer weighted-splits, CDN/Cache
  absorb-then-forward, Application broadcasts to all dependencies.
- Entry Point load pattern: constant RPS, live-adjustable.
- Load Balancer has its own capacity ceiling (can itself bottleneck).
- Engine is pub/sub (Observer pattern), not an engine-driven topological walk;
  Entry Point is the only active/clocked component.
