import type { IncidentController } from "./incident-controller";

export function createIncidentToolHandlers(controller: IncidentController) {
  return {
    investigate_incident: () => {
      const state = controller.investigateIncident();
      return { state: state.state, evidence: state.evidence, hypotheses: state.hypotheses };
    },
    register_constraint: () => {
      const state = controller.registerConstraint("restart_postgresql");
      return { state: state.state, constraints: state.constraints };
    },
    propose_remediation: () => {
      const state = controller.proposeRemediation();
      return { state: state.state, remediationOptions: state.remediationOptions };
    },
    request_authorization: () => {
      const state = controller.requestAuthorization();
      return { state: state.state, authorizationRequired: state.authorization === null };
    },
    execute_rolling_rollback: () => {
      const state = controller.executeRollingRollback();
      return { state: state.state, rollbackProgress: state.rollbackProgress };
    },
    verify_recovery: () => {
      const state = controller.verifyRecovery();
      return { state: state.state, metrics: state.metrics, recoveryChecks: state.recoveryChecks };
    },
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
