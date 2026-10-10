import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { SimulaloadCanvas } from "./SimulaloadCanvas";
import { SimulationEngine } from "../../engine/SimulationEngine";
import { createComponent } from "../../engine/factory";

// jsdom has no layout engine, so React Flow never measures nodes and never
// renders edges. These are the jsdom shims React Flow's testing guide
// recommends: a ResizeObserver that fires immediately and non-zero offsets.
const originalResizeObserver = globalThis.ResizeObserver;
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalDOMMatrixReadOnly = globalThis.DOMMatrixReadOnly;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const contentRect = { x: 0, y: 0, width: 100, height: 40 } as DOMRectReadOnly;
      this.callback([{ target, contentRect } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly = class {
    m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
      this.m22 = scale !== undefined ? Number(scale) : 1;
    }
  } as unknown as typeof DOMMatrixReadOnly;
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, get: () => 100 },
    offsetHeight: { configurable: true, get: () => 40 },
  });
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.DOMMatrixReadOnly = originalDOMMatrixReadOnly;
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
});

describe("SimulaloadCanvas", () => {
  it("renders a React Flow node for each node added to the engine", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("cdn", "cdn1"));

    render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, cdn1: { x: 200, y: 0 } }}
        edgeRegistry={[]}
      />,
    );

    expect(screen.getByText(/entry point/i)).toBeInTheDocument();
    expect(screen.getByText(/cdn/i)).toBeInTheDocument();
  });

  it("re-renders node RPS labels after a manual engine tick", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 77 }));

    render(<SimulaloadCanvas engine={engine} nodePositions={{ entry1: { x: 0, y: 0 } }} edgeRegistry={[]} />);
    act(() => engine.tick());

    expect(screen.getByText(/77/)).toBeInTheDocument();
  });

  it("renders one edge per registry entry and keeps rendering as edge loads change", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1", { targetRps: 40 }));
    engine.addNode(createComponent("loadBalancer", "lb1"));
    engine.addEdge("entry1", "lb1", "e1");

    const { container } = render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, lb1: { x: 200, y: 0 } }}
        edgeRegistry={[{ edgeId: "e1", source: "entry1", target: "lb1" }]}
      />,
    );
    act(() => engine.tick());

    expect(engine.getSnapshot().edgeLoads["e1"]).toBe(40);
    expect(container.querySelectorAll(".react-flow__edge")).toHaveLength(1);
  });

  it("removes a selected node from the engine on Delete and reports it upward", async () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("cdn", "cdn1"));
    const onNodeRemoved = vi.fn();

    render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, cdn1: { x: 200, y: 0 } }}
        edgeRegistry={[]}
        onNodeRemoved={onNodeRemoved}
      />,
    );
    const cdnNode = screen.getByText(/cdn/i).closest(".react-flow__node") as HTMLElement;
    // Keyboard-select the node (React Flow's a11y path), then press Delete.
    fireEvent.keyDown(cdnNode, { key: "Enter" });
    fireEvent.keyUp(cdnNode, { key: "Enter" });
    expect(cdnNode).toHaveClass("selected");
    fireEvent.keyDown(document.body, { key: "Delete", code: "Delete" });
    fireEvent.keyUp(document.body, { key: "Delete", code: "Delete" });

    // React Flow's deleteElements is async.
    await waitFor(() => expect(onNodeRemoved).toHaveBeenCalledWith("cdn1"));
    expect(engine.getNode("cdn1")).toBeUndefined();
  });

  it("never deletes the pinned Entry Point", async () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    const onNodeRemoved = vi.fn();

    render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 } }}
        edgeRegistry={[]}
        onNodeRemoved={onNodeRemoved}
      />,
    );
    const entryNode = screen.getByText(/entry point/i).closest(".react-flow__node") as HTMLElement;
    fireEvent.keyDown(entryNode, { key: "Enter" });
    fireEvent.keyUp(entryNode, { key: "Enter" });
    expect(entryNode).toHaveClass("selected");
    fireEvent.keyDown(document.body, { key: "Delete", code: "Delete" });
    fireEvent.keyUp(document.body, { key: "Delete", code: "Delete" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onNodeRemoved).not.toHaveBeenCalled();
    expect(engine.getNode("entry1")).toBeDefined();
  });

  it("removes a selected edge from the engine on Delete and reports it upward", async () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("loadBalancer", "lb1"));
    engine.addEdge("entry1", "lb1", "e1");
    const onEdgeRemoved = vi.fn();

    const { container } = render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, lb1: { x: 200, y: 0 } }}
        edgeRegistry={[{ edgeId: "e1", source: "entry1", target: "lb1" }]}
        onEdgeRemoved={onEdgeRemoved}
      />,
    );
    const edge = container.querySelector(".react-flow__edge") as HTMLElement;
    fireEvent.keyDown(edge, { key: "Enter" });
    fireEvent.keyUp(edge, { key: "Enter" });
    fireEvent.keyDown(document.body, { key: "Delete", code: "Delete" });
    fireEvent.keyUp(document.body, { key: "Delete", code: "Delete" });

    await waitFor(() => expect(onEdgeRemoved).toHaveBeenCalledWith("e1"));
    expect(engine.getEdges()).toEqual([]);
  });

  it("propagates node position changes upward so moves are not snapped back", () => {
    const engine = new SimulationEngine();
    engine.addNode(createComponent("entryPoint", "entry1"));
    engine.addNode(createComponent("cdn", "cdn1"));
    const onNodeMoved = vi.fn();

    render(
      <SimulaloadCanvas
        engine={engine}
        nodePositions={{ entry1: { x: 0, y: 0 }, cdn1: { x: 200, y: 0 } }}
        edgeRegistry={[]}
        onNodeMoved={onNodeMoved}
      />,
    );
    const cdnNode = screen.getByText(/cdn/i).closest(".react-flow__node") as HTMLElement;
    fireEvent.keyDown(cdnNode, { key: "Enter" });
    fireEvent.keyUp(cdnNode, { key: "Enter" });
    // React Flow's keyboard-move path emits the same position changes as a drag.
    fireEvent.keyDown(cdnNode, { key: "ArrowRight" });

    expect(onNodeMoved).toHaveBeenCalled();
    const [nodeId, position] = onNodeMoved.mock.calls[0];
    expect(nodeId).toBe("cdn1");
    expect(position.x).toBeGreaterThan(200);
  });
});
