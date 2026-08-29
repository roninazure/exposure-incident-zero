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

test("controller drives the governed UI/WebMCP sequence from one state source", async () => {
  const controller = controllerModule.createIncidentController();
  const revisions = [];
  controller.subscribe((state) => revisions.push(state.revision));

  await controller.investigateIncident("t1", 0);
  controller.authorizeRollback("t5");
  await controller.executeRollingRollback("t6", 0);
  assert.equal(controller.getState().state, "INCIDENT_CLOSED");
  assert.deepEqual(revisions, [2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
});

test("investigation reveals evidence and governance in deterministic stages", async () => {
  const controller = controllerModule.createIncidentController();
  const snapshots = [];
  controller.subscribe((state) => snapshots.push({
    state: state.state,
    events: state.events.map((item) => item.type),
    hasRootCause: state.hypotheses.some((item) => item.role === "root_cause" && item.status === "supported"),
    hasConstraint: state.constraints.length > 0,
    hasRemediation: state.remediationOptions.length > 0,
  }));

  const investigation = controller.investigateIncident("t1", 5);
  assert.equal(controller.getState().state, "INVESTIGATED");
  assert.equal(controller.getState().hypotheses.length, 0);
  await investigation;

  const events = controller.getState().events.map((item) => item.type);
  assert.equal(controller.getState().state, "AWAITING_HUMAN_AUTHORIZATION");
  assert.ok(events.indexOf("evidence_app_abnormality") < events.indexOf("root_cause_supported"));
  assert.ok(events.indexOf("evidence_postgresql_distress") < events.indexOf("root_cause_supported"));
  assert.ok(events.indexOf("evidence_database_contradiction") < events.indexOf("root_cause_supported"));
  assert.ok(events.indexOf("root_cause_supported") < events.indexOf("constraint_registered"));
  assert.ok(events.indexOf("constraint_registered") < events.indexOf("remediation_proposed"));
  assert.ok(events.indexOf("remediation_proposed") < events.indexOf("authorization_requested"));
  assert.equal(snapshots[0].hasRootCause, false);
  assert.equal(snapshots[0].hasConstraint, false);
  assert.equal(snapshots[0].hasRemediation, false);
  assert.ok(snapshots.some((snapshot) => snapshot.events.includes("evidence_app_abnormality") && !snapshot.hasRootCause));
  assert.ok(snapshots.some((snapshot) => snapshot.events.includes("evidence_database_contradiction") && !snapshot.hasRootCause));
});

test("one execution request stages rollback, recovery verification, and sealing", async () => {
  const controller = controllerModule.createIncidentController();
  await controller.investigateIncident("t1", 0);
  controller.authorizeRollback("t5");
  const states = [];
  controller.subscribe((state) => states.push({ state: state.state, completed: [...state.rollback.completedNodes] }));

  const execution = controller.executeRollingRollback("t6", 10);
  assert.equal(controller.getState().state, "ROLLING_BACK");
  assert.equal(controller.getState().metrics.http502Rate, 18.7);
  await execution;

  assert.deepEqual(states.map((item) => item.state), [
    "ROLLING_BACK", "ROLLING_BACK", "ROLLING_BACK", "ROLLING_BACK",
    "RECOVERY_VERIFYING", "RECOVERY_VERIFIED", "INCIDENT_CLOSED",
  ]);
  assert.deepEqual(states.slice(0, 4).map((item) => item.completed), [[], ["app-01"], ["app-01", "app-02"], ["app-01", "app-02", "app-03"]]);
  assert.deepEqual(controller.getState().metrics, { http502Rate: 0.1, p95LatencyMs: 240, dbConnections: 126, replicationLagSeconds: 1.2 });
});

test("controller prevents execution before authorization", async () => {
  const controller = controllerModule.createIncidentController();
  await controller.investigateIncident("t1", 0);

  await assert.rejects(
    () => controller.executeRollingRollback("t5", 0),
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

test("controller owns deterministic evidence, hypotheses, remediation, execution, and recovery records", async () => {
  const controller = controllerModule.createIncidentController();
  await controller.investigateIncident("t1", 0);
  let state = controller.getState();
  controller.authorizeRollback("t5");
  state = await controller.executeRollingRollback("t6", 0);

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
  assert.equal(state.state, "INCIDENT_CLOSED");
  assert.equal(state.recoveryChecks.length, 4);
  assert.ok(state.recoveryChecks.every((check) => check.passed));
});
