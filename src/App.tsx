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
