/** "loadBalancer" -> "Load Balancer", "cdn" -> "CDN". */
export function formatTypeLabel(type: string): string {
  if (type === "cdn") return "CDN";
  const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
