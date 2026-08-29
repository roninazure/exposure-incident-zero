import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", configFile: false, root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true } });
const controllerModule = await vite.ssrLoadModule("/app/incident-controller.ts");
const stateModule = await vite.ssrLoadModule("/app/incident-state.ts");
const toolsModule = await vite.ssrLoadModule("/app/webmcp-tools.ts");
test.after(async () => vite.close());

async function readyController() {
  const controller = controllerModule.createIncidentController();
  await controller.investigateIncident("t1", 0);
  return controller;
}

test("WebMCP handlers expose shared structured records", async () => {
  const controller = controllerModule.createIncidentController();
  const tools = toolsModule.createIncidentToolHandlers(controller);
  const investigation = await tools.investigate_incident();
  assert.equal(investigation.evidence.length, 8);
  assert.equal(investigation.hypotheses.find((item) => item.role === "root_cause").label, "checkout-api v2.8.14");
  assert.equal(controller.getState().constraints[0].status, "prohibited");
  assert.equal(controller.getState().remediationOptions.find((item) => item.status === "preferred").action, "rolling_rollback");
  assert.equal(controller.getState().state, "AWAITING_HUMAN_AUTHORIZATION");
  const blocked = await tools.execute_rolling_rollback();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "AUTHORIZATION_REQUIRED");
  controller.authorizeRollback("t5");
  const execution = await tools.execute_rolling_rollback();
  assert.deepEqual(execution.rollbackProgress.map((item) => item.node), ["app-01", "app-02", "app-03"]);
  assert.equal(execution.state, "INCIDENT_CLOSED");
  assert.equal(execution.recoveryChecks, undefined);
});

test("rollback progress rejects out-of-order node records", async () => {
  const controller = await readyController();
  let state = stateModule.authorizeRollback(controller.getState(), "t5");
  state = stateModule.executeRollingRollback(state, "t6");
  assert.throws(() => stateModule.recordRollbackNode(state, "app-03", "t7"), (error) => error.code === "ROLLBACK_ORDER_VIOLATION");
});

test("recovery requires every metric check and every node health check", async () => {
  const controller = await readyController();
  controller.authorizeRollback("t5");
  let state = stateModule.executeRollingRollback(controller.getState(), "t6");
  state = stateModule.recordRollbackNode(state, "app-01", "t6a");
  state = stateModule.recordRollbackNode(state, "app-02", "t6b");
  state = stateModule.recordRollbackNode(state, "app-03", "t6c");
  state = stateModule.beginRecoveryVerification(state, "t6d");
  assert.throws(() => stateModule.verifyRecovery(state, { http502Rate: 0.1, p95LatencyMs: 240, dbConnections: 126, replicationLagSeconds: 6 }, "t7"), (error) => error.code === "RECOVERY_THRESHOLDS_NOT_MET");
  assert.equal(state.recoveryChecks.length, 0);
});

test("verify_recovery succeeds through the active recovery verification path", async () => {
  const base = await readyController();
  let state = stateModule.authorizeRollback(base.getState(), "t5");
  state = stateModule.executeRollingRollback(state, "t6");
  state = stateModule.recordRollbackNode(state, "app-01", "t6a");
  state = stateModule.recordRollbackNode(state, "app-02", "t6b");
  state = stateModule.recordRollbackNode(state, "app-03", "t6c");
  state = stateModule.beginRecoveryVerification(state, "t6d");

  const controller = controllerModule.createIncidentController(state);
  const result = toolsModule.createIncidentToolHandlers(controller).verify_recovery();

  assert.equal(result.ok, true);
  assert.equal(result.state, "RECOVERY_VERIFIED");
  assert.equal(result.alreadyVerified, undefined);
  assert.equal(result.recoveryChecks.length, 4);
  assert.ok(result.recoveryChecks.every((check) => check.passed));
});

test("verify_recovery is read-only and deterministic after the incident is closed", async () => {
  const controller = await readyController();
  controller.authorizeRollback("t5");
  const tools = toolsModule.createIncidentToolHandlers(controller);
  const execution = await tools.execute_rolling_rollback();
  assert.equal(execution.state, "INCIDENT_CLOSED");

  const before = controller.getState();
  const first = tools.verify_recovery();
  const afterFirst = controller.getState();
  const second = tools.verify_recovery();
  const afterSecond = controller.getState();

  assert.equal(first.ok, true);
  assert.equal(first.alreadyVerified, true);
  assert.equal(first.state, "INCIDENT_CLOSED");
  assert.deepEqual(first, second);
  assert.equal(afterFirst.revision, before.revision);
  assert.equal(afterSecond.revision, before.revision);
  assert.deepEqual(afterSecond.events, before.events);
});

test("verify_recovery does not fabricate success before rollback recovery", () => {
  const controller = controllerModule.createIncidentController();
  const result = toolsModule.createIncidentToolHandlers(controller).verify_recovery();

  assert.equal(result.ok, false);
  assert.equal(result.code, "ROLLBACK_NOT_ACTIVE");
});
