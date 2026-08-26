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
  type ActionName,
  type IncidentState,
  type RecoveryMetrics,
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
  const listeners = new Set<Listener>();

  const publish = (next: IncidentState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
    return state;
  };

  const controller = {
    getState: () => state,
    reset: () => publish(createInitialIncidentState()),
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    investigateIncident: (at?: string) => {
      let next = transitionIncident(state, "INVESTIGATED", at);
      next = transitionIncident(next, "ROOT_CAUSE_SUPPORTED", at);
      return publish(next);
    },
    registerConstraint: (action: ActionName = "restart_postgresql", at?: string) =>
      publish(registerConstraint(state, action, at)),
    proposeRemediation: (at?: string) => publish(proposeRollback(state, at)),
    requestAuthorization: (at?: string) => publish(requestAuthorization(state, at)),
    authorizeRollback: (at?: string) => publish(authorizeRollback(state, at)),
    executeRollingRollback: (at?: string) => publish(executeRollingRollback(state, at)),
    verifyRecovery: (metrics: RecoveryMetrics = RECOVERY_METRICS, at?: string) =>
      publish(verifyRecovery(state, metrics, at)),
    closeIncident: (at?: string) => publish(closeIncident(state, at)),
    recoveryMetrics: () => ({ ...RECOVERY_METRICS }),
  };

  return controller;
}

export type IncidentController = ReturnType<typeof createIncidentController>;
