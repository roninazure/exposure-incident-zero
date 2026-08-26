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
  assert.deepEqual(revisions, [3, 5, 6, 7, 8, 12, 13, 14]);
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

test("controller owns deterministic evidence, hypotheses, remediation, execution, and recovery records", () => {
  const controller = controllerModule.createIncidentController();
  controller.investigateIncident("t1");
  let state = controller.registerConstraint("restart_postgresql", "t2");
  state = controller.proposeRemediation("t3");
  controller.requestAuthorization("t4");
  controller.authorizeRollback("t5");
  state = controller.executeRollingRollback("t6");

  assert.deepEqual(state.evidence.map((item) => item.supports), [
    "connection-pool misconfiguration", "excessive PostgreSQL connections", "PostgreSQL CPU pressure",
    "checkout latency", "upstream timeouts / HTTP 502", "Redis/session pressure",
    "PostgreSQL replication lag", "customer impact",
  ]);
  assert.equal(state.hypotheses.find((item) => item.role === "root_cause").status, "supported");
  assert.equal(state.hypotheses.find((item) => item.role === "victim").status, "symptom");
  assert.equal(state.remediationOptions.find((item) => item.action === "rolling_rollback").status, "preferred");
  assert.deepEqual(state.rollbackProgress.map((item) => [item.node, item.rollback, item.healthCheck]), [
    ["app-01", "completed", "passed"], ["app-02", "completed", "passed"], ["app-03", "completed", "passed"],
  ]);
  state = controller.verifyRecovery(undefined, "t7");
  assert.equal(state.recoveryChecks.length, 4);
  assert.ok(state.recoveryChecks.every((check) => check.passed));
});
