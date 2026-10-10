import { useCallback, useState } from "react";
import { SimulationEngine } from "./engine/SimulationEngine";
import { createComponent } from "./engine/factory";
import { SimulaloadCanvas } from "./ui/canvas/SimulaloadCanvas";
import { Toolbox } from "./ui/toolbox/Toolbox";
import { InspectorPanel } from "./ui/inspector/InspectorPanel";
import { SummaryBar } from "./ui/summary/SummaryBar";
import { useEngineSnapshot } from "./ui/hooks/useEngineSnapshot";
import type { ComponentType, NodeId } from "./engine/types";

const engine = new SimulationEngine();
let nextId = 1;

function App() {
  const [positions, setPositions] = useState<Record<NodeId, { x: number; y: number }>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const snapshot = useEngineSnapshot(engine);

  const handleAdd = useCallback((type: ComponentType) => {
    const nodeId = `${type}-${nextId++}`;
    engine.addNode(createComponent(type, nodeId));
    setPositions((prev) => ({ ...prev, [nodeId]: { x: 100 + nextId * 20, y: 100 } }));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh" }}>
      <SummaryBar snapshot={snapshot} />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Toolbox onAdd={handleAdd} />
        <SimulaloadCanvas
          engine={engine}
          nodePositions={positions}
          onNodeClick={setSelectedNodeId}
        />
        <InspectorPanel engine={engine} selectedNodeId={selectedNodeId} />
      </div>
    </div>
  );
}

export default App;
