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
