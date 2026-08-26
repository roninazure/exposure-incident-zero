import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

const controllerModule = await vite.ssrLoadModule("/app/incident-controller.ts");

test.after(async () => vite.close());

test("controller drives the governed UI/WebMCP sequence from one state source", () => {
  const controller = controllerModule.createIncidentController();
  const revisions = [];
  controller.subscribe((state) => revisions.push(state.revision));

  controller.investigateIncident("t1");
  controller.registerConstraint("restart_postgresql", "t2");
  controller.proposeRemediation("t3");
  controller.requestAuthorization("t4");
  controller.authorizeRollback("t5");
  controller.executeRollingRollback("t6");
  controller.verifyRecovery(undefined, "t7");
  controller.closeIncident("t8");

  assert.equal(controller.getState().state, "INCIDENT_CLOSED");
  assert.deepEqual(revisions, [2, 4, 5, 6, 7, 8, 9, 10]);
});

test("controller prevents execution before authorization", () => {
  const controller = controllerModule.createIncidentController();
  controller.investigateIncident("t1");
  controller.registerConstraint("restart_postgresql", "t2");
  controller.proposeRemediation("t3");
  controller.requestAuthorization("t4");

  assert.throws(
    () => controller.executeRollingRollback("t5"),
    (error) => error.code === "AUTHORIZATION_REQUIRED",
  );
});

test("controller exposes the same deterministic recovery metrics to UI and tools", () => {
  const controller = controllerModule.createIncidentController();
  const first = controller.recoveryMetrics();
  const second = controller.recoveryMetrics();

  assert.deepEqual(first, {
    http502Rate: 0.1,
    p95LatencyMs: 240,
    dbConnections: 126,
    replicationLagSeconds: 1.2,
  });
  assert.deepEqual(first, second);
});
