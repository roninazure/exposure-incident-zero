import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const vite = await createServer({ appType: "custom", configFile: false, root: new URL("..", import.meta.url).pathname, server: { middlewareMode: true } });
const horizon = await vite.ssrLoadModule("/app/horizon.ts");
const theme = await vite.ssrLoadModule("/app/theme.ts");
const state = await vite.ssrLoadModule("/app/incident-state.ts");
test.after(async () => vite.close());

function incident(name) {
  const base = state.createInitialIncidentState();
  return { ...base, state: name };
}

test("every incident stage maps deterministically to the Horizon state", () => {
  const expected = {
    ACTIVE_INCIDENT: "MIDNIGHT", INVESTIGATED: "DAWN_OF_INVESTIGATION", ROOT_CAUSE_SUPPORTED: "ROOT_CAUSE_REVEALED",
    DATABASE_RESTART_FORBIDDEN: "ROOT_CAUSE_REVEALED", ROLLBACK_PROPOSED: "AMBER_AUTHORIZATION",
    AWAITING_HUMAN_AUTHORIZATION: "AMBER_AUTHORIZATION", AUTHORIZED: "GOLDEN_REMEDIATION", ROLLING_BACK: "GOLDEN_REMEDIATION",
    RECOVERY_VERIFIED: "DAYLIGHT_RECOVERY", INCIDENT_CLOSED: "DUSK_INCIDENT_SEALED",
  };
  for (const [stage, horizonState] of Object.entries(expected)) assert.equal(horizon.deriveHorizonState(incident(stage)), horizonState);
});

test("evidence deterministically changes investigation from dawn to pressure", () => {
  const base = incident("INVESTIGATED");
  assert.equal(horizon.deriveHorizonState(base), "DAWN_OF_INVESTIGATION");
  assert.equal(horizon.deriveHorizonState({ ...base, evidence: [{ id: "e1" }] }), "PRESSURE_BUILDING");
});

test("execution progress exposes visual node progression without mutating domain state", () => {
  const base = incident("ROLLING_BACK");
  const visual = horizon.getHorizonVisual(base);
  assert.equal(visual.state, "GOLDEN_REMEDIATION");
  assert.equal(visual.lightPosition, "right");
  assert.equal(base.state, "ROLLING_BACK");
});

test("theme preference selection and toggling are deterministic", () => {
  assert.equal(theme.resolveInitialTheme("light", false), "light");
  assert.equal(theme.resolveInitialTheme(null, true), "light");
  assert.equal(theme.resolveInitialTheme("invalid", false), "dark");
  assert.equal(theme.toggleTheme("dark"), "light");
  assert.equal(theme.toggleTheme("light"), "dark");
});
