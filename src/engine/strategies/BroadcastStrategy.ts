import type { EdgeId, WeightedEdge } from "../types";
import type { DispatchStrategyInterface } from "../interfaces";

export class BroadcastStrategy implements DispatchStrategyInterface {
  computeOutputs(availableLoad: number, edges: WeightedEdge[]): Map<EdgeId, number> {
    const outputs = new Map<EdgeId, number>();
    for (const edge of edges) outputs.set(edge.edgeId, availableLoad);
    return outputs;
  }
}
