import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

const state = await vite.ssrLoadModule("/app/incident-state.ts");
const visibility = await vite.ssrLoadModule("/app/incident-visibility.ts");

test.after(async () => vite.close());

test("initial state hides root cause, victim, constraint, and remediation", () => {
  const incident = state.createInitialIncidentState();

  assert.equal(visibility.hasRootCauseSupport(incident), false);
  assert.equal(visibility.hasConstraintRegistration(incident), false);
  assert.equal(visibility.hasRemediationProposal(incident), false);
  assert.equal(visibility.hasIncidentEvent(incident, "root_cause_supported"), false);
  assert.equal(visibility.hasIncidentEvent(incident, "constraint_registered"), false);
  assert.equal(visibility.hasIncidentEvent(incident, "remediation_proposed"), false);
});

test("post-investigation records unlock conclusions in sequence", () => {
  let incident = state.createInitialIncidentState();
  incident = state.transitionIncident(incident, "INVESTIGATED", "t1");
  incident = state.establishInvestigationRecords(incident, "t1");
  incident = state.transitionIncident(incident, "ROOT_CAUSE_SUPPORTED", "t1");

  assert.equal(visibility.hasRootCauseSupport(incident), true);
  assert.equal(visibility.hasConstraintRegistration(incident), false);
  assert.equal(visibility.hasRemediationProposal(incident), false);

  incident = state.registerConstraint(incident, "restart_postgresql", "t2");
  assert.equal(visibility.hasConstraintRegistration(incident), true);
  assert.equal(visibility.hasRemediationProposal(incident), false);

  incident = state.proposeRollback(incident, "t3");
  assert.equal(visibility.hasRemediationProposal(incident), true);
});
