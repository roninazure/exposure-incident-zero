export const TOPOLOGY_COORDINATE_SYSTEM = {
  width: 800,
  height: 390,
} as const;

export const TOPOLOGY_NODE_BOUNDS = {
  width: 148,
  height: 56,
} as const;

export const TOPOLOGY_TIER_ROWS = {
  edge: 42,
  web: 124,
  application: 218,
  data: 322,
} as const;

export const TOPOLOGY_SIBLING_COLUMNS = {
  edge: [400],
  web: [270, 530],
  application: [130, 400, 670],
  data: [130, 400, 670],
} as const;

export type TopologyNodeId =
  | "edge-lb01"
  | "web-01"
  | "web-02"
  | "app-01"
  | "app-02"
  | "app-03"
  | "cache-01"
  | "db-primary"
  | "db-replica";

export type TopologyPortName = "top" | "bottom" | "bottom-left" | "bottom-right";

export type TopologyPoint = {
  x: number;
  y: number;
};

export type TopologyNode = {
  id: TopologyNodeId;
  role: string;
  status: "healthy" | "critical" | "degraded";
  tier: keyof typeof TOPOLOGY_TIER_ROWS;
  center: TopologyPoint;
  semantic?: "root-cause" | "victim";
};

export type TopologyEdge = {
  id: string;
  from: { node: TopologyNodeId; port: TopologyPortName };
  to: { node: TopologyNodeId; port: TopologyPortName };
  route: { kind: "orthogonal"; channelY: number };
  remediationStep?: 1 | 2 | 3;
};

export const TOPOLOGY_NODES: readonly TopologyNode[] = [
  { id: "edge-lb01", role: "Nginx edge", status: "healthy", tier: "edge", center: { x: 400, y: 42 } },
  { id: "web-01", role: "Web tier", status: "healthy", tier: "web", center: { x: 270, y: 124 } },
  { id: "web-02", role: "Web tier", status: "healthy", tier: "web", center: { x: 530, y: 124 } },
  { id: "app-01", role: "Checkout API", status: "critical", tier: "application", center: { x: 130, y: 218 }, semantic: "root-cause" },
  { id: "app-02", role: "Checkout API", status: "critical", tier: "application", center: { x: 400, y: 218 }, semantic: "root-cause" },
  { id: "app-03", role: "Checkout API", status: "critical", tier: "application", center: { x: 670, y: 218 }, semantic: "root-cause" },
  { id: "cache-01", role: "Redis cache", status: "healthy", tier: "data", center: { x: 130, y: 322 } },
  { id: "db-primary", role: "PostgreSQL primary", status: "degraded", tier: "data", center: { x: 400, y: 322 }, semantic: "victim" },
  { id: "db-replica", role: "PostgreSQL replica", status: "degraded", tier: "data", center: { x: 670, y: 322 } },
] as const;

export const TOPOLOGY_GROUPS = [
  {
    id: "postgresql-cluster",
    label: "POSTGRESQL · PRIMARY / REPLICA",
    bounds: { x: 312, y: 280, width: 446, height: 82 },
  },
] as const;

export const TOPOLOGY_EDGES: readonly TopologyEdge[] = [
  { id: "edge-lb01-web-01", from: { node: "edge-lb01", port: "bottom-left" }, to: { node: "web-01", port: "top" }, route: { kind: "orthogonal", channelY: 83 } },
  { id: "edge-lb01-web-02", from: { node: "edge-lb01", port: "bottom-right" }, to: { node: "web-02", port: "top" }, route: { kind: "orthogonal", channelY: 83 } },
  { id: "web-01-app-01", from: { node: "web-01", port: "bottom-left" }, to: { node: "app-01", port: "top" }, route: { kind: "orthogonal", channelY: 171 }, remediationStep: 1 },
  { id: "web-02-app-03", from: { node: "web-02", port: "bottom-right" }, to: { node: "app-03", port: "top" }, route: { kind: "orthogonal", channelY: 171 }, remediationStep: 3 },
  { id: "web-01-app-02", from: { node: "web-01", port: "bottom-right" }, to: { node: "app-02", port: "top" }, route: { kind: "orthogonal", channelY: 171 }, remediationStep: 2 },
  { id: "app-01-cache-01", from: { node: "app-01", port: "bottom" }, to: { node: "cache-01", port: "top" }, route: { kind: "orthogonal", channelY: 270 } },
  { id: "app-02-db-primary", from: { node: "app-02", port: "bottom" }, to: { node: "db-primary", port: "top" }, route: { kind: "orthogonal", channelY: 270 } },
  { id: "app-03-db-replica", from: { node: "app-03", port: "bottom" }, to: { node: "db-replica", port: "top" }, route: { kind: "orthogonal", channelY: 270 } },
] as const;

const nodeById = new Map(TOPOLOGY_NODES.map((node) => [node.id, node]));

export function getNodeBounds(node: TopologyNode) {
  return {
    x: node.center.x - TOPOLOGY_NODE_BOUNDS.width / 2,
    y: node.center.y - TOPOLOGY_NODE_BOUNDS.height / 2,
    width: TOPOLOGY_NODE_BOUNDS.width,
    height: TOPOLOGY_NODE_BOUNDS.height,
  };
}

export function getPortPoint(nodeId: TopologyNodeId, port: TopologyPortName): TopologyPoint {
  const node = nodeById.get(nodeId);
  if (!node) throw new Error(`Unknown topology node: ${nodeId}`);
  const bounds = getNodeBounds(node);
  const portX = {
    top: node.center.x,
    bottom: node.center.x,
    "bottom-left": node.center.x - bounds.width / 4,
    "bottom-right": node.center.x + bounds.width / 4,
  }[port];
  const portY = port === "top" ? bounds.y : bounds.y + bounds.height;
  return { x: portX, y: portY };
}

export function getEdgePoints(edge: TopologyEdge): readonly TopologyPoint[] {
  const source = getPortPoint(edge.from.node, edge.from.port);
  const target = getPortPoint(edge.to.node, edge.to.port);
  return [source, { x: source.x, y: edge.route.channelY }, { x: target.x, y: edge.route.channelY }, target];
}

export function getEdgePath(edge: TopologyEdge): string {
  const [source, sourceChannel, targetChannel, target] = getEdgePoints(edge);
  return `M ${source.x} ${source.y} V ${sourceChannel.y} H ${targetChannel.x} V ${target.y}`;
}
