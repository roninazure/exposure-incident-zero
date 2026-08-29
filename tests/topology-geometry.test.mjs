import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as geometry from "../app/topology-geometry.ts";

test("defines one exact coordinate system, node bound, and aligned tier model", () => {
  assert.deepEqual(geometry.TOPOLOGY_COORDINATE_SYSTEM, { width: 800, height: 390 });
  assert.deepEqual(geometry.TOPOLOGY_NODE_BOUNDS, { width: 148, height: 56 });
  assert.deepEqual(geometry.TOPOLOGY_TIER_ROWS, { edge: 42, web: 124, application: 218, data: 322 });
  assert.deepEqual(geometry.TOPOLOGY_SIBLING_COLUMNS, {
    edge: [400],
    web: [270, 530],
    application: [130, 400, 670],
    data: [130, 400, 670],
  });

  const centersByTier = Object.fromEntries(
    Object.keys(geometry.TOPOLOGY_TIER_ROWS).map((tier) => [
      tier,
      geometry.TOPOLOGY_NODES.filter((node) => node.tier === tier).map((node) => node.center.x),
    ]),
  );
  assert.deepEqual(centersByTier, geometry.TOPOLOGY_SIBLING_COLUMNS);
});

test("routes every dependency between explicit node-boundary ports", () => {
  const expected = [
    ["edge-lb01", "bottom-left", "web-01", "top"],
    ["edge-lb01", "bottom-right", "web-02", "top"],
    ["web-01", "bottom-left", "app-01", "top"],
    ["web-02", "bottom-right", "app-03", "top"],
    ["web-01", "bottom-right", "app-02", "top"],
    ["app-01", "bottom", "cache-01", "top"],
    ["app-02", "bottom", "db-primary", "top"],
    ["app-03", "bottom", "db-replica", "top"],
  ];
  assert.deepEqual(
    geometry.TOPOLOGY_EDGES.map((edge) => [edge.from.node, edge.from.port, edge.to.node, edge.to.port]),
    expected,
  );

  const nodes = new Map(geometry.TOPOLOGY_NODES.map((node) => [node.id, node]));
  for (const edge of geometry.TOPOLOGY_EDGES) {
    const sourceBounds = geometry.getNodeBounds(nodes.get(edge.from.node));
    const targetBounds = geometry.getNodeBounds(nodes.get(edge.to.node));
    const source = geometry.getPortPoint(edge.from.node, edge.from.port);
    const target = geometry.getPortPoint(edge.to.node, edge.to.port);
    assert.equal(source.y, sourceBounds.y + sourceBounds.height);
    assert.equal(target.y, targetBounds.y);
    assert.ok(edge.route.channelY > source.y && edge.route.channelY < target.y);
    assert.match(geometry.getEdgePath(edge), /^M \d+ \d+ V \d+ H \d+ V \d+$/);
  }
});

test("orthogonal routes do not cross unrelated node interiors", () => {
  const inside = (value, start, size) => value > start && value < start + size;
  const overlapsInterior = (a, b, start, size) => Math.max(Math.min(a, b), start) < Math.min(Math.max(a, b), start + size);
  const segmentCrosses = (a, b, bounds) => {
    if (a.x === b.x) return inside(a.x, bounds.x, bounds.width) && overlapsInterior(a.y, b.y, bounds.y, bounds.height);
    return inside(a.y, bounds.y, bounds.height) && overlapsInterior(a.x, b.x, bounds.x, bounds.width);
  };

  for (const edge of geometry.TOPOLOGY_EDGES) {
    const points = geometry.getEdgePoints(edge);
    for (const node of geometry.TOPOLOGY_NODES) {
      if (node.id === edge.from.node || node.id === edge.to.node) continue;
      const bounds = geometry.getNodeBounds(node);
      for (let index = 1; index < points.length; index += 1) {
        assert.equal(segmentCrosses(points[index - 1], points[index], bounds), false, `${edge.id} crosses ${node.id}`);
      }
    }
  }
});

test("the UI consumes the shared geometry without approximate connector logic", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /TOPOLOGY_NODES\.map/);
  assert.match(page, /TOPOLOGY_EDGES\.map/);
  assert.match(page, /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(page, /connectorPoint|preserveAspectRatio="none"/);
  assert.match(css, /\.node-healthy/);
  assert.doesNotMatch(css, /\.node-health(?:\s|\{|\.)/);
});
