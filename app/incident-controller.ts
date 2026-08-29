import {
  authorizeRollback,
  closeIncident,
  createInitialIncidentState,
  executeRollingRollback,
  proposeRollback,
  registerConstraint,
  requestAuthorization,
  transitionIncident,
  verifyRecovery,
  beginRecoveryVerification,
  establishInvestigationRecords,
  recordInvestigationEvent,
  recordRollbackNode,
  type ActionName,
  type IncidentState,
  type RecoveryMetrics,
  IncidentGuardError,
} from "./incident-state";

type Listener = (state: IncidentState) => void;

const RECOVERY_METRICS: RecoveryMetrics = {
  http502Rate: 0.1,
  p95LatencyMs: 240,
  dbConnections: 126,
  replicationLagSeconds: 1.2,
};

export function createIncidentController(initialState = createInitialIncidentState()) {
  let state = initialState;
  let executionRun = 0;
  let executionPromise: Promise<IncidentState> | null = null;
  let investigationRun = 0;
  let investigationPromise: Promise<IncidentState> | null = null;
  const listeners = new Set<Listener>();

  const publish = (next: IncidentState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
    return state;
  };

  const controller = {
    getState: () => state,
    reset: () => {
      executionRun += 1;
      executionPromise = null;
      investigationRun += 1;
      investigationPromise = null;
      return publish(createInitialIncidentState());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    investigateIncident: (at?: string, delayMs = 800) => {
      if (investigationPromise) return investigationPromise;
      const run = ++investigationRun;
      investigationPromise = (async () => {
        let next = recordInvestigationEvent(
          transitionIncident(state, "INVESTIGATED", at),
          "investigation_started",
          "Investigating production dependency chain",
          at,
        );
        publish(next);
        const milestones: Array<[string, string]> = [
          ["evidence_app_abnormality", "App-tier abnormality detected · checkout-api v2.8.14 shows abnormal connection-pool behavior"],
          ["evidence_postgresql_distress", "PostgreSQL connection pressure observed · 126 → 947 active sessions"],
          ["evidence_database_contradiction", "No PostgreSQL/database change occurred in the release window"],
        ];
        for (const [type, detail] of milestones) {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (run !== investigationRun) throw new IncidentGuardError("INVESTIGATION_CANCELLED", "Investigation was cancelled.");
          publish(recordInvestigationEvent(state, type, detail, at));
        }
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== investigationRun) throw new IncidentGuardError("INVESTIGATION_CANCELLED", "Investigation was cancelled.");
        next = establishInvestigationRecords(state, at);
        next = transitionIncident(next, "ROOT_CAUSE_SUPPORTED", at);
        publish(next);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== investigationRun) throw new IncidentGuardError("INVESTIGATION_CANCELLED", "Investigation was cancelled.");
        publish(registerConstraint(state, "restart_postgresql", at));
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== investigationRun) throw new IncidentGuardError("INVESTIGATION_CANCELLED", "Investigation was cancelled.");
        publish(proposeRollback(state, at));
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== investigationRun) throw new IncidentGuardError("INVESTIGATION_CANCELLED", "Investigation was cancelled.");
        return publish(requestAuthorization(state, at));
      })();
      return investigationPromise.finally(() => { if (run === investigationRun) investigationPromise = null; });
    },
    registerConstraint: (action: ActionName = "restart_postgresql", at?: string) =>
      publish(registerConstraint(state, action, at)),
    proposeRemediation: (at?: string) => publish(proposeRollback(state, at)),
    requestAuthorization: (at?: string) => publish(requestAuthorization(state, at)),
    authorizeRollback: (at?: string) => publish(authorizeRollback(state, at)),
    executeRollingRollback: (at?: string, delayMs = 800) => {
      if (executionPromise) return executionPromise;
      const run = ++executionRun;
      executionPromise = (async () => {
        let next = executeRollingRollback(state, at);
        publish(next);
        for (const node of ["app-01", "app-02", "app-03"] as const) {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (run !== executionRun) throw new IncidentGuardError("EXECUTION_CANCELLED", "Rollback execution was cancelled.");
          next = recordRollbackNode(state, node, at);
          publish(next);
        }
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== executionRun) throw new IncidentGuardError("EXECUTION_CANCELLED", "Rollback execution was cancelled.");
        publish(beginRecoveryVerification(state, at));
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== executionRun) throw new IncidentGuardError("EXECUTION_CANCELLED", "Rollback execution was cancelled.");
        publish(verifyRecovery(state, RECOVERY_METRICS, at));
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (run !== executionRun) throw new IncidentGuardError("EXECUTION_CANCELLED", "Rollback execution was cancelled.");
        return publish(closeIncident(state, at));
      })();
      return executionPromise.finally(() => { if (run === executionRun) executionPromise = null; });
    },
    verifyRecovery: (metrics: RecoveryMetrics = RECOVERY_METRICS, at?: string) =>
      publish(verifyRecovery(state, metrics, at)),
    closeIncident: (at?: string) => publish(closeIncident(state, at)),
    recoveryMetrics: () => ({ ...RECOVERY_METRICS }),
  };

  return controller;
}

export type IncidentController = ReturnType<typeof createIncidentController>;
