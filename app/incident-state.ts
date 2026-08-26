export const INCIDENT_STATES = [
  "ACTIVE_INCIDENT",
  "INVESTIGATED",
  "ROOT_CAUSE_SUPPORTED",
  "DATABASE_RESTART_FORBIDDEN",
  "ROLLBACK_PROPOSED",
  "AWAITING_HUMAN_AUTHORIZATION",
  "AUTHORIZED",
  "ROLLING_BACK",
  "RECOVERY_VERIFIED",
  "INCIDENT_CLOSED",
] as const;

export type IncidentStateName = (typeof INCIDENT_STATES)[number];

export type ActionName =
  | "restart_postgresql"
  | "execute_rolling_rollback";

export type IncidentEvent = {
  id: string;
  at: string;
  type: string;
  detail: string;
};

export type Constraint = {
  action: ActionName;
  status: "prohibited";
  authority: "human_operator";
  registeredAt: string;
};

export type RecoveryMetrics = {
  http502Rate: number;
  p95LatencyMs: number;
  dbConnections: number;
  replicationLagSeconds: number;
};

export const RECOVERY_THRESHOLDS: RecoveryMetrics = {
  http502Rate: 1,
  p95LatencyMs: 500,
  dbConnections: 200,
  replicationLagSeconds: 5,
};

export type AuthorizationRecord = {
  action: "rolling_rollback";
  fromVersion: string;
  toVersion: string;
  authorizedAt: string;
  authority: "human_operator";
};

export type IncidentState = {
  incidentId: "INC-2048";
  state: IncidentStateName;
  rootCause: "checkout-api v2.8.14";
  victim: "db-primary";
  constraints: Constraint[];
  authorization: AuthorizationRecord | null;
  rollback: {
    fromVersion: "v2.8.14";
    toVersion: "v2.8.13";
    completedNodes: string[];
  };
  metrics: RecoveryMetrics;
  thresholds: RecoveryMetrics;
  events: IncidentEvent[];
  revision: number;
};

export class IncidentGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IncidentGuardError";
    this.code = code;
  }
}

const INCIDENT_METRICS: RecoveryMetrics = {
  http502Rate: 18.7,
  p95LatencyMs: 8400,
  dbConnections: 947,
  replicationLagSeconds: 42,
};

const ALLOWED_TRANSITIONS: Record<IncidentStateName, IncidentStateName[]> = {
  ACTIVE_INCIDENT: ["INVESTIGATED"],
  INVESTIGATED: ["ROOT_CAUSE_SUPPORTED"],
  ROOT_CAUSE_SUPPORTED: ["DATABASE_RESTART_FORBIDDEN"],
  DATABASE_RESTART_FORBIDDEN: ["ROLLBACK_PROPOSED"],
  ROLLBACK_PROPOSED: ["AWAITING_HUMAN_AUTHORIZATION"],
  AWAITING_HUMAN_AUTHORIZATION: ["AUTHORIZED"],
  AUTHORIZED: ["ROLLING_BACK"],
  ROLLING_BACK: ["RECOVERY_VERIFIED"],
  RECOVERY_VERIFIED: ["INCIDENT_CLOSED"],
  INCIDENT_CLOSED: [],
};

function event(state: IncidentState, type: string, detail: string, at: string): IncidentEvent {
  return { id: `evt-${state.revision + 1}`, at, type, detail };
}

function withTransition(
  state: IncidentState,
  next: IncidentStateName,
  type: string,
  detail: string,
  at: string,
): IncidentState {
  if (!ALLOWED_TRANSITIONS[state.state].includes(next)) {
    throw new IncidentGuardError(
      "INVALID_TRANSITION",
      `Cannot transition from ${state.state} to ${next}`,
    );
  }

  return {
    ...state,
    state: next,
    revision: state.revision + 1,
    events: [...state.events, event(state, type, detail, at)],
  };
}

export function createInitialIncidentState(): IncidentState {
  return {
    incidentId: "INC-2048",
    state: "ACTIVE_INCIDENT",
    rootCause: "checkout-api v2.8.14",
    victim: "db-primary",
    constraints: [],
    authorization: null,
    rollback: {
      fromVersion: "v2.8.14",
      toVersion: "v2.8.13",
      completedNodes: [],
    },
    metrics: { ...INCIDENT_METRICS },
    thresholds: { ...RECOVERY_THRESHOLDS },
    events: [],
    revision: 0,
  };
}

export function transitionIncident(
  state: IncidentState,
  next: IncidentStateName,
  at = new Date().toISOString(),
): IncidentState {
  return withTransition(state, next, "state_transition", `${state.state} → ${next}`, at);
}

export function registerConstraint(
  state: IncidentState,
  action: ActionName,
  at = new Date().toISOString(),
): IncidentState {
  if (state.constraints.some((constraint) => constraint.action === action)) return state;

  const constrained: IncidentState = {
    ...state,
    constraints: [
      ...state.constraints,
      { action, status: "prohibited", authority: "human_operator", registeredAt: at },
    ],
    revision: state.revision + 1,
    events: [...state.events, event(state, "constraint_registered", `${action} prohibited`, at)],
  };

  return state.state === "ROOT_CAUSE_SUPPORTED"
    ? withTransition(
        constrained,
        "DATABASE_RESTART_FORBIDDEN",
        "state_transition",
        "ROOT_CAUSE_SUPPORTED → DATABASE_RESTART_FORBIDDEN",
        at,
      )
    : constrained;
}

export function assertActionAllowed(state: IncidentState, action: ActionName): void {
  if (action === "restart_postgresql" && state.constraints.some((item) => item.action === action)) {
    throw new IncidentGuardError(
      "CONSTRAINT_VIOLATION",
      "PostgreSQL restart is prohibited by the human operator.",
    );
  }

  if (action === "execute_rolling_rollback" && state.state !== "AUTHORIZED") {
    throw new IncidentGuardError(
      "AUTHORIZATION_REQUIRED",
      "Rolling rollback requires explicit human authorization.",
    );
  }
}

export function proposeRollback(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  if (!state.constraints.some((item) => item.action === "restart_postgresql")) {
    throw new IncidentGuardError(
      "CONSTRAINT_REQUIRED",
      "The PostgreSQL restart constraint must be registered before proposing rollback.",
    );
  }

  return transitionIncident(state, "ROLLBACK_PROPOSED", at);
}

export function requestAuthorization(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  return transitionIncident(state, "AWAITING_HUMAN_AUTHORIZATION", at);
}

export function authorizeRollback(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  const next = transitionIncident(state, "AUTHORIZED", at);
  return {
    ...next,
    authorization: {
      action: "rolling_rollback",
      fromVersion: "v2.8.14",
      toVersion: "v2.8.13",
      authorizedAt: at,
      authority: "human_operator",
    },
  };
}

export function executeRollingRollback(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  assertActionAllowed(state, "execute_rolling_rollback");
  return transitionIncident(state, "ROLLING_BACK", at);
}

export function recordRollbackNode(
  state: IncidentState,
  node: string,
  at = new Date().toISOString(),
): IncidentState {
  if (state.state !== "ROLLING_BACK") {
    throw new IncidentGuardError("ROLLBACK_NOT_ACTIVE", "Rolling rollback is not active.");
  }
  if (state.rollback.completedNodes.includes(node)) return state;

  return {
    ...state,
    rollback: { ...state.rollback, completedNodes: [...state.rollback.completedNodes, node] },
    revision: state.revision + 1,
    events: [...state.events, event(state, "rollback_node_completed", node, at)],
  };
}

export function verifyRecovery(
  state: IncidentState,
  metrics: RecoveryMetrics,
  at = new Date().toISOString(),
): IncidentState {
  if (state.state !== "ROLLING_BACK") {
    throw new IncidentGuardError("ROLLBACK_NOT_ACTIVE", "Recovery cannot be verified before rollback.");
  }

  const passed =
    metrics.http502Rate <= state.thresholds.http502Rate &&
    metrics.p95LatencyMs <= state.thresholds.p95LatencyMs &&
    metrics.dbConnections <= state.thresholds.dbConnections &&
    metrics.replicationLagSeconds <= state.thresholds.replicationLagSeconds;

  if (!passed) {
    throw new IncidentGuardError("RECOVERY_THRESHOLDS_NOT_MET", "Recovery thresholds have not been met.");
  }

  const next = withTransition(state, "RECOVERY_VERIFIED", "recovery_verified", "All recovery thresholds passed", at);
  return { ...next, metrics: { ...metrics } };
}

export function closeIncident(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  return transitionIncident(state, "INCIDENT_CLOSED", at);
}
