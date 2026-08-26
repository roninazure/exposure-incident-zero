import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", configFile: false, root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true } });
const controllerModule = await vite.ssrLoadModule("/app/incident-controller.ts");
const stateModule = await vite.ssrLoadModule("/app/incident-state.ts");
const toolsModule = await vite.ssrLoadModule("/app/webmcp-tools.ts");
test.after(async () => vite.close());

function readyController() {
  const controller = controllerModule.createIncidentController();
  controller.investigateIncident("t1");
  controller.registerConstraint("restart_postgresql", "t2");
  controller.proposeRemediation("t3");
  controller.requestAuthorization("t4");
  return controller;
}

test("WebMCP handlers expose shared structured records", () => {
  const controller = controllerModule.createIncidentController();
  const tools = toolsModule.createIncidentToolHandlers(controller);
  const investigation = tools.investigate_incident();
  assert.equal(investigation.evidence.length, 8);
  assert.equal(investigation.hypotheses.find((item) => item.role === "root_cause").label, "checkout-api v2.8.14");
  const constraint = tools.register_constraint();
  assert.equal(constraint.constraints[0].status, "prohibited");
  const remediation = tools.propose_remediation();
  assert.equal(remediation.remediationOptions.find((item) => item.status === "preferred").action, "rolling_rollback");
  tools.request_authorization();
  assert.throws(() => controller.executeRollingRollback("t5"), (error) => error.code === "AUTHORIZATION_REQUIRED");
  controller.authorizeRollback("t5");
  const execution = tools.execute_rolling_rollback();
  assert.deepEqual(execution.rollbackProgress.map((item) => item.node), ["app-01", "app-02", "app-03"]);
  const recovery = tools.verify_recovery();
  assert.equal(recovery.recoveryChecks.filter((check) => check.passed).length, 4);
});

test("rollback progress rejects out-of-order node records", () => {
  const controller = readyController();
  let state = stateModule.authorizeRollback(controller.getState(), "t5");
  state = stateModule.executeRollingRollback(state, "t6");
  assert.throws(() => stateModule.recordRollbackNode(state, "app-03", "t7"), (error) => error.code === "ROLLBACK_ORDER_VIOLATION");
});

test("recovery requires every metric check and every node health check", () => {
  const controller = readyController();
  controller.authorizeRollback("t5");
  controller.executeRollingRollback("t6");
  assert.throws(() => controller.verifyRecovery({ http502Rate: 0.1, p95LatencyMs: 240, dbConnections: 126, replicationLagSeconds: 6 }, "t7"), (error) => error.code === "RECOVERY_THRESHOLDS_NOT_MET");
  const state = controller.getState();
  assert.equal(state.recoveryChecks.length, 0);
});
