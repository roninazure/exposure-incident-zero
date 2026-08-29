import type { IncidentController } from "./incident-controller";

export function createIncidentToolHandlers(controller: IncidentController) {
  const hasSuccessfulRecovery = (state: ReturnType<IncidentController["getState"]>) =>
    (state.state === "RECOVERY_VERIFIED" || state.state === "INCIDENT_CLOSED")
    && state.recoveryChecks.length === Object.keys(state.thresholds).length
    && state.recoveryChecks.every((check) => check.passed)
    && state.rollbackProgress.every((node) => node.rollback === "completed" && node.healthCheck === "passed");

  const run = <T extends object>(execute: () => T) => {
    try {
      return { ok: true as const, ...execute() };
    } catch (error) {
      const state = controller.getState();
      return { ok: false as const, code: error instanceof Error && "code" in error ? String((error as Error & { code: string }).code) : "TOOL_ERROR", message: error instanceof Error ? error.message : "Tool execution failed", state: state.state };
    }
  };
  return {
    investigate_incident: async () => {
      try {
        const state = await controller.investigateIncident();
        return { ok: true as const, state: state.state, evidence: state.evidence, hypotheses: state.hypotheses };
      } catch (error) {
        const state = controller.getState();
        return { ok: false as const, code: error instanceof Error && "code" in error ? String((error as Error & { code: string }).code) : "TOOL_ERROR", message: error instanceof Error ? error.message : "Tool execution failed", state: state.state };
      }
    },
    register_constraint: () => run(() => {
      const state = controller.registerConstraint("restart_postgresql");
      return { state: state.state, constraints: state.constraints };
    }),
    propose_remediation: () => run(() => {
      const state = controller.proposeRemediation();
      return { state: state.state, remediationOptions: state.remediationOptions };
    }),
    request_authorization: () => run(() => {
      const state = controller.requestAuthorization();
      return { state: state.state, authorizationRequired: state.authorization === null, human_authorization_required: state.authorization === null };
    }),
    execute_rolling_rollback: async () => {
      try {
        const state = await controller.executeRollingRollback();
        return { ok: true as const, state: state.state, rollbackProgress: state.rollbackProgress };
      } catch (error) {
        const state = controller.getState();
        return { ok: false as const, code: error instanceof Error && "code" in error ? String((error as Error & { code: string }).code) : "TOOL_ERROR", message: error instanceof Error ? error.message : "Tool execution failed", state: state.state };
      }
    },
    verify_recovery: () => run(() => {
      const current = controller.getState();
      if (hasSuccessfulRecovery(current)) {
        return { state: current.state, metrics: current.metrics, recoveryChecks: current.recoveryChecks, alreadyVerified: true as const };
      }
      const state = controller.verifyRecovery();
      return { state: state.state, metrics: state.metrics, recoveryChecks: state.recoveryChecks };
    }),
  };
}

export const INCIDENT_TOOL_DESCRIPTIONS = {
  investigate_incident: "Correlate deterministic evidence and evaluate incident hypotheses.",
  register_constraint: "Register the human PostgreSQL restart prohibition.",
  propose_remediation: "Evaluate governed remediation options.",
  request_authorization: "Request explicit human approval for the preferred remediation.",
  execute_rolling_rollback: "Execute the authorized app-01, app-02, app-03 rollback in order.",
  verify_recovery: "Evaluate every recovery metric and application health threshold.",
} as const;
