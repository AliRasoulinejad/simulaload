import { useCallback, useState } from "react";
import { SimulationEngine } from "./engine/SimulationEngine";
import { createComponent } from "./engine/factory";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";
import { Toolbox } from "./ui/toolbox/Toolbox";
import { InspectorPanel } from "./ui/inspector/InspectorPanel";
import { SummaryBar } from "./ui/summary/SummaryBar";
import { PersistenceControls } from "./ui/persistence/PersistenceControls";
import { useEngineSnapshot } from "./ui/hooks/useEngineSnapshot";
import { PauseIcon, PlayIcon } from "./ui/icons";
import type { ComponentType, NodeId } from "./engine/types";
import "./App.css";

const ENTRY_POINT_ID = "entry-point";

// The engine lives at module scope (outside React state); it is mutated in
// place — including on import, via engine.clear() — so its identity and its
// subscribers stay valid for the lifetime of the app. The one pinned Entry
// Point is seeded here rather than in a state initializer so StrictMode's
// double-invoked initializers can't try to add it twice.
const engine = new SimulationEngine();
engine.addNode(createComponent("entryPoint", ENTRY_POINT_ID));
let nextId = 1;

type EdgeRegistryEntry = { edgeId: string; source: NodeId; target: NodeId };

function App() {
  const [positions, setPositions] = useState<Record<NodeId, { x: number; y: number }>>({
    [ENTRY_POINT_ID]: { x: 50, y: 200 },
  });
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [edgeRegistry, setEdgeRegistry] = useState<EdgeRegistryEntry[]>([]);
  const [running, setRunning] = useState(false);
  const snapshot = useEngineSnapshot(engine);

  const handleAdd = useCallback((type: ComponentType) => {
    const slot = nextId++;
    const nodeId = `${type}-${Date.now()}-${slot}`;
    engine.addNode(createComponent(type, nodeId));
    const column = (slot - 1) % 5;
    const row = Math.floor((slot - 1) / 5);
    setPositions((prev) => ({ ...prev, [nodeId]: { x: 250 + column * 180, y: 100 + row * 120 } }));
  }, []);

  const toggleRunning = useCallback(() => {
    if (running) {
      engine.pause();
      setRunning(false);
    } else {
      engine.start();
      setRunning(true);
    }
  }, [running]);

  const handleNodeMoved = useCallback((nodeId: NodeId, position: { x: number; y: number }) => {
    setPositions((prev) => ({ ...prev, [nodeId]: position }));
  }, []);

  const handleNodeRemoved = useCallback((nodeId: NodeId) => {
    setPositions((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setEdgeRegistry((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
  }, []);

  const handleEdgeRemoved = useCallback((edgeId: string) => {
    setEdgeRegistry((prev) => prev.filter((edge) => edge.edgeId !== edgeId));
  }, []);

  const handleEdgeCreated = useCallback((edge: EdgeRegistryEntry) => {
    setEdgeRegistry((prev) => [...prev, edge]);
  }, []);

  return (
    <div className="app-shell">
      <SummaryBar snapshot={snapshot} />
      <div className="app-body">
        <div className="palette">
          <button type="button" className="palette-run" onClick={toggleRunning} aria-pressed={running}>
            {running ? <PauseIcon /> : <PlayIcon />}
            {running ? "Pause" : "Start"}
          </button>
          <div className="palette-section-label">Add component</div>
          <Toolbox onAdd={handleAdd} />
        </div>
        <div className="app-canvas">
          <SimulaloadCanvas
            engine={engine}
            nodePositions={positions}
            edgeRegistry={edgeRegistry}
            onNodeClick={setSelectedNodeId}
            onEdgeCreated={handleEdgeCreated}
            onNodeMoved={handleNodeMoved}
            onNodeRemoved={handleNodeRemoved}
            onEdgeRemoved={handleEdgeRemoved}
          />
          <PersistenceControls
            engine={engine}
            positions={positions}
            onImported={(positions) => {
              // importGraph cleared the engine (which also stops its clock).
              setRunning(false);
              setSelectedNodeId(null);
              setPositions(positions);
              setEdgeRegistry(engine.getEdges().map(({ edgeId, sourceId, targetId }) => ({ edgeId, source: sourceId, target: targetId })));
            }}
          />
        </div>
        <InspectorPanel engine={engine} selectedNodeId={selectedNodeId} />
      </div>
    </div>
  );
}

export default App;
