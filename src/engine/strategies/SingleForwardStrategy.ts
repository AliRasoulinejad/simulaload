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
