import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

const model = await vite.ssrLoadModule("/app/incident-state.ts");

test.after(async () => vite.close());

test("requires the exact governed incident sequence", () => {
  let state = model.createInitialIncidentState();
  state = model.transitionIncident(state, "INVESTIGATED", "t1");
  state = model.transitionIncident(state, "ROOT_CAUSE_SUPPORTED", "t2");
  state = model.registerConstraint(state, "restart_postgresql", "t3");
  state = model.proposeRollback(state, "t4");
  state = model.requestAuthorization(state, "t5");
  state = model.authorizeRollback(state, "t6");
  state = model.executeRollingRollback(state, "t7");
  state = model.recordRollbackNode(state, "app-01", "t7a");
  state = model.recordRollbackNode(state, "app-02", "t7b");
  state = model.recordRollbackNode(state, "app-03", "t7c");
  assert.throws(() => model.closeIncident(state, "t7c-seal"), (error) => error.code === "INVALID_TRANSITION");
  state = model.beginRecoveryVerification(state, "t7d");
  state = model.verifyRecovery(state, {
    http502Rate: 0.1,
    p95LatencyMs: 240,
    dbConnections: 126,
    replicationLagSeconds: 1.2,
  }, "t8");
  state = model.closeIncident(state, "t9");

  assert.equal(state.state, "INCIDENT_CLOSED");
  assert.equal(state.events.length, 15);
});

test("rejects PostgreSQL restart after human constraint registration", () => {
  let state = model.createInitialIncidentState();
  state = model.transitionIncident(state, "INVESTIGATED", "t1");
  state = model.transitionIncident(state, "ROOT_CAUSE_SUPPORTED", "t2");
  state = model.registerConstraint(state, "restart_postgresql", "t3");

  assert.throws(
    () => model.assertActionAllowed(state, "restart_postgresql"),
    (error) => error.code === "CONSTRAINT_VIOLATION",
  );
});

test("rejects rollback execution before explicit authorization", () => {
  let state = model.createInitialIncidentState();
  state = model.transitionIncident(state, "INVESTIGATED", "t1");
  state = model.transitionIncident(state, "ROOT_CAUSE_SUPPORTED", "t2");
  state = model.registerConstraint(state, "restart_postgresql", "t3");
  state = model.proposeRollback(state, "t4");
  state = model.requestAuthorization(state, "t5");

  assert.throws(
    () => model.executeRollingRollback(state, "t6"),
    (error) => error.code === "AUTHORIZATION_REQUIRED",
  );
});

test("rejects recovery until all deterministic thresholds pass", () => {
  let state = model.createInitialIncidentState();
  state = model.transitionIncident(state, "INVESTIGATED", "t1");
  state = model.transitionIncident(state, "ROOT_CAUSE_SUPPORTED", "t2");
  state = model.registerConstraint(state, "restart_postgresql", "t3");
  state = model.proposeRollback(state, "t4");
  state = model.requestAuthorization(state, "t5");
  state = model.authorizeRollback(state, "t6");
  state = model.executeRollingRollback(state, "t7");

  assert.throws(
    () => model.verifyRecovery(state, {
      http502Rate: 2,
      p95LatencyMs: 240,
      dbConnections: 126,
      replicationLagSeconds: 1.2,
    }, "t8"),
    (error) => error.code === "ROLLBACK_INCOMPLETE",
  );
});
