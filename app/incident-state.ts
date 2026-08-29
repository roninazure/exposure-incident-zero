export const INCIDENT_STATES = [
  "ACTIVE_INCIDENT",
  "INVESTIGATED",
  "ROOT_CAUSE_SUPPORTED",
  "DATABASE_RESTART_FORBIDDEN",
  "ROLLBACK_PROPOSED",
  "AWAITING_HUMAN_AUTHORIZATION",
  "AUTHORIZED",
  "ROLLING_BACK",
  "RECOVERY_VERIFYING",
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

export type EvidenceRecord = {
  id: string;
  sequence: number;
  subject: string;
  observation: string;
  supports: string;
  at: string;
};

export type HypothesisEvaluation = {
  id: string;
  label: string;
  role: "root_cause" | "victim" | "alternative";
  status: "supported" | "symptom" | "rejected";
  confidence: number;
  rationale: string;
  evidenceIds: string[];
};

export type RemediationOption = {
  id: string;
  action: ActionName | "rolling_rollback";
  label: string;
  status: "preferred" | "prohibited" | "rejected";
  permitted: boolean;
  score: number;
  rationale: string;
};

export type RollbackNode = {
  node: "app-01" | "app-02" | "app-03";
  rollback: "pending" | "completed";
  healthCheck: "pending" | "passed";
};

export type RecoveryCheck = {
  id: string;
  metric: keyof RecoveryMetrics;
  observed: number;
  threshold: number;
  operator: "lte";
  passed: boolean;
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
  evidence: EvidenceRecord[];
  hypotheses: HypothesisEvaluation[];
  remediationOptions: RemediationOption[];
  rollbackProgress: RollbackNode[];
  recoveryChecks: RecoveryCheck[];
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

const ROLLBACK_NODES: RollbackNode[] = (["app-01", "app-02", "app-03"] as const).map((node) => ({
  node,
  rollback: "pending",
  healthCheck: "pending",
}));

const ALLOWED_TRANSITIONS: Record<IncidentStateName, IncidentStateName[]> = {
  ACTIVE_INCIDENT: ["INVESTIGATED"],
  INVESTIGATED: ["ROOT_CAUSE_SUPPORTED"],
  ROOT_CAUSE_SUPPORTED: ["DATABASE_RESTART_FORBIDDEN"],
  DATABASE_RESTART_FORBIDDEN: ["ROLLBACK_PROPOSED"],
  ROLLBACK_PROPOSED: ["AWAITING_HUMAN_AUTHORIZATION"],
  AWAITING_HUMAN_AUTHORIZATION: ["AUTHORIZED"],
  AUTHORIZED: ["ROLLING_BACK"],
  ROLLING_BACK: ["RECOVERY_VERIFYING", "RECOVERY_VERIFIED"],
  RECOVERY_VERIFYING: ["RECOVERY_VERIFIED"],
  RECOVERY_VERIFIED: ["INCIDENT_CLOSED"],
  INCIDENT_CLOSED: [],
};

function event(state: IncidentState, type: string, detail: string, at: string): IncidentEvent {
  return { id: `evt-${state.events.length + 1}`, at, type, detail };
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
    evidence: [],
    hypotheses: [],
    remediationOptions: [],
    rollbackProgress: ROLLBACK_NODES.map((item) => ({ ...item })),
    recoveryChecks: [],
    events: [{ id: "evt-1", at: "09:41:07", type: "incident_created", detail: "SEV-1 incident created" }],
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

export function recordInvestigationEvent(
  state: IncidentState,
  type: string,
  detail: string,
  at = new Date().toISOString(),
): IncidentState {
  return {
    ...state,
    revision: state.revision + 1,
    events: [...state.events, event(state, type, detail, at)],
  };
}

export function establishInvestigationRecords(state: IncidentState, at = new Date().toISOString()): IncidentState {
  if (state.evidence.length > 0) return state;
  const chain: Array<[string, string, string]> = [
    ["checkout-api v2.8.14", "Release deployed to the checkout tier at 09:38 UTC.", "connection-pool misconfiguration"],
    ["connection-pool misconfiguration", "Pool limits permit excessive concurrent database sessions.", "excessive PostgreSQL connections"],
    ["excessive PostgreSQL connections", "db-primary active sessions rose from 126 to 947.", "PostgreSQL CPU pressure"],
    ["PostgreSQL CPU pressure", "db-primary CPU reached 93% under connection pressure.", "checkout latency"],
    ["checkout latency", "Checkout p95 latency increased to 8,400 ms.", "upstream timeouts / HTTP 502"],
    ["upstream timeouts / HTTP 502", "HTTP 502 rate increased to 18.7%.", "Redis/session pressure"],
    ["Redis/session pressure", "Session retries increased during failed checkout requests.", "PostgreSQL replication lag"],
    ["PostgreSQL replication lag", "db-replica lag increased to 42 seconds.", "customer impact"],
  ];
  const evidence = chain.map(([subject, observation, supports], index) => ({
    id: `evidence-${String(index + 1).padStart(2, "0")}`,
    sequence: index + 1,
    subject,
    observation,
    supports,
    at,
  }));
  const hypotheses: HypothesisEvaluation[] = [
    { id: "hypothesis-checkout-release", label: "checkout-api v2.8.14", role: "root_cause", status: "supported", confidence: 0.94, rationale: "The release precedes the pool change and every downstream signal in sequence.", evidenceIds: ["evidence-01", "evidence-02", "evidence-03"] },
    { id: "hypothesis-postgresql", label: "PostgreSQL resource failure", role: "victim", status: "symptom", confidence: 0.21, rationale: "PostgreSQL is under downstream load; no database change caused the connection surge.", evidenceIds: ["evidence-03", "evidence-04", "evidence-08"] },
    { id: "hypothesis-network", label: "Network degradation", role: "alternative", status: "rejected", confidence: 0.08, rationale: "No correlated packet loss or route change exists in the release window.", evidenceIds: [] },
  ];
  const remediationOptions: RemediationOption[] = [
    { id: "remediation-rollback", action: "rolling_rollback", label: "Rolling rollback v2.8.14 → v2.8.13", status: "preferred", permitted: true, score: 0.96, rationale: "Removes the supported root cause without restarting the database." },
    { id: "remediation-db-restart", action: "restart_postgresql", label: "Restart PostgreSQL", status: "prohibited", permitted: false, score: 0, rationale: "Explicitly prohibited by the human operator constraint." },
  ];
  const investigationEvents: Array<[string, string]> = [
    ["investigation_started", "Incident investigation started"],
    ["evidence_app_abnormality", "checkout-api v2.8.14 shows abnormal connection-pool behavior"],
    ["evidence_postgresql_distress", "db-primary connection pressure and CPU distress observed"],
    ["evidence_database_contradiction", "No PostgreSQL/database change occurred in the release window"],
    ["root_cause_supported", "checkout-api v2.8.14 supported as root cause; PostgreSQL classified as downstream victim"],
    ["investigation_completed", "Evidence correlation and hypothesis evaluation completed"],
  ];
  const existingEventTypes = new Set(state.events.map((item) => item.type));
  const events = investigationEvents.reduce((items, [type, detail]) => {
    if (existingEventTypes.has(type)) return items;
    const snapshot = { ...state, events: items };
    return [...items, event(snapshot, type, detail, at)];
  }, state.events);
  return {
    ...state,
    evidence,
    hypotheses,
    remediationOptions,
    revision: state.revision + 1,
    events,
  };
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

  const next = transitionIncident(state, "ROLLBACK_PROPOSED", at);
  next.events[next.events.length - 1].type = "remediation_proposed";
  return next;
}

export function requestAuthorization(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  const next = transitionIncident(state, "AWAITING_HUMAN_AUTHORIZATION", at);
  next.events[next.events.length - 1].type = "authorization_requested";
  return next;
}

export function authorizeRollback(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  const next = transitionIncident(state, "AUTHORIZED", at);
  next.events[next.events.length - 1].type = "authorization_approved";
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
  const next = transitionIncident(state, "ROLLING_BACK", at);
  next.events[next.events.length - 1].type = "rollback_started";
  return next;
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
  const expected = (["app-01", "app-02", "app-03"] as const)[state.rollback.completedNodes.length];
  if (node !== expected) throw new IncidentGuardError("ROLLBACK_ORDER_VIOLATION", `Expected ${expected} before ${node}.`);

  return {
    ...state,
    rollback: { ...state.rollback, completedNodes: [...state.rollback.completedNodes, node] },
    rollbackProgress: state.rollbackProgress.map((item) => item.node === node ? { ...item, rollback: "completed", healthCheck: "passed" } : item),
    revision: state.revision + 1,
    events: [...state.events, event(state, "rollback_node_completed", node, at)],
  };
}

export function beginRecoveryVerification(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  if (state.state !== "ROLLING_BACK" || state.rollback.completedNodes.length !== 3) {
    throw new IncidentGuardError(
      "ROLLBACK_INCOMPLETE",
      "Recovery verification requires all three application nodes to be rolled back.",
    );
  }

  return withTransition(
    state,
    "RECOVERY_VERIFYING",
    "recovery_verification_started",
    "Checking deterministic recovery thresholds",
    at,
  );
}

export function verifyRecovery(
  state: IncidentState,
  metrics: RecoveryMetrics,
  at = new Date().toISOString(),
): IncidentState {
  if (state.state !== "ROLLING_BACK" && state.state !== "RECOVERY_VERIFYING") {
    throw new IncidentGuardError("ROLLBACK_NOT_ACTIVE", "Recovery cannot be verified before rollback.");
  }

  if (state.rollback.completedNodes.length !== 3) {
    throw new IncidentGuardError(
      "ROLLBACK_INCOMPLETE",
      "Recovery cannot be verified before all three application nodes are rolled back.",
    );
  }

  const recoveryChecks: RecoveryCheck[] = (Object.keys(state.thresholds) as Array<keyof RecoveryMetrics>).map((metric) => ({
    id: `recovery-${metric}`,
    metric,
    observed: metrics[metric],
    threshold: state.thresholds[metric],
    operator: "lte",
    passed: metrics[metric] <= state.thresholds[metric],
  }));
  const passed = recoveryChecks.every((check) => check.passed) && state.rollbackProgress.every((node) => node.healthCheck === "passed");

  if (!passed) {
    throw new IncidentGuardError("RECOVERY_THRESHOLDS_NOT_MET", "Recovery thresholds have not been met.");
  }

  const next = withTransition(state, "RECOVERY_VERIFIED", "recovery_verified", "All recovery thresholds and node health checks passed", at);
  return { ...next, metrics: { ...metrics }, recoveryChecks };
}

export function closeIncident(
  state: IncidentState,
  at = new Date().toISOString(),
): IncidentState {
  const next = transitionIncident(state, "INCIDENT_CLOSED", at);
  next.events[next.events.length - 1].type = "incident_sealed";
  return next;
}
