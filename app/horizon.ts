import type { IncidentState, IncidentStateName } from "./incident-state";

export const HORIZON_STATES = [
  "MIDNIGHT",
  "DAWN_OF_INVESTIGATION",
  "PRESSURE_BUILDING",
  "ROOT_CAUSE_REVEALED",
  "AMBER_AUTHORIZATION",
  "GOLDEN_REMEDIATION",
  "DAYLIGHT_RECOVERY",
  "DUSK_INCIDENT_SEALED",
] as const;

export type HorizonState = (typeof HORIZON_STATES)[number];

export type HorizonVisual = {
  state: HorizonState;
  lightPosition: "center";
  atmosphere: "midnight" | "dawn" | "pressure" | "root-cause" | "authorization" | "remediation" | "recovery" | "sealed";
  intensity: number;
};

export function deriveHorizonState(incident: Pick<IncidentState, "state" | "evidence" | "hypotheses">): HorizonState {
  if (incident.state === "ACTIVE_INCIDENT") return "MIDNIGHT";
  if (incident.state === "INVESTIGATED") return incident.evidence.length > 0 ? "PRESSURE_BUILDING" : "DAWN_OF_INVESTIGATION";
  if (incident.state === "ROOT_CAUSE_SUPPORTED" || incident.state === "DATABASE_RESTART_FORBIDDEN") return "ROOT_CAUSE_REVEALED";
  if (incident.state === "ROLLBACK_PROPOSED" || incident.state === "AWAITING_HUMAN_AUTHORIZATION") return "AMBER_AUTHORIZATION";
  if (incident.state === "AUTHORIZED" || incident.state === "ROLLING_BACK") return "GOLDEN_REMEDIATION";
  if (incident.state === "RECOVERY_VERIFYING" || incident.state === "RECOVERY_VERIFIED") return "DAYLIGHT_RECOVERY";
  return "DUSK_INCIDENT_SEALED";
}

const visualByState: Record<HorizonState, Omit<HorizonVisual, "state" | "intensity">> = {
  MIDNIGHT: { lightPosition: "center", atmosphere: "midnight" },
  DAWN_OF_INVESTIGATION: { lightPosition: "center", atmosphere: "dawn" },
  PRESSURE_BUILDING: { lightPosition: "center", atmosphere: "pressure" },
  ROOT_CAUSE_REVEALED: { lightPosition: "center", atmosphere: "root-cause" },
  AMBER_AUTHORIZATION: { lightPosition: "center", atmosphere: "authorization" },
  GOLDEN_REMEDIATION: { lightPosition: "center", atmosphere: "remediation" },
  DAYLIGHT_RECOVERY: { lightPosition: "center", atmosphere: "recovery" },
  DUSK_INCIDENT_SEALED: { lightPosition: "center", atmosphere: "sealed" },
};

export function getHorizonVisual(incident: Pick<IncidentState, "state" | "evidence" | "hypotheses" | "metrics">): HorizonVisual {
  const state = deriveHorizonState(incident);
  const evidencePressure = Math.min(1, incident.evidence.length / 8);
  const confidence = incident.hypotheses.find((item) => item.role === "root_cause")?.confidence ?? 0;
  const baseIntensity: Record<HorizonState, number> = {
    MIDNIGHT: 0.72,
    DAWN_OF_INVESTIGATION: 0.78,
    PRESSURE_BUILDING: 0.82,
    ROOT_CAUSE_REVEALED: 0.88,
    AMBER_AUTHORIZATION: 0.86,
    GOLDEN_REMEDIATION: 0.92,
    DAYLIGHT_RECOVERY: 0.88,
    DUSK_INCIDENT_SEALED: 0.76,
  };
  const intensity = state === "PRESSURE_BUILDING"
    ? Math.min(0.96, baseIntensity[state] + evidencePressure * 0.12)
    : state === "ROOT_CAUSE_REVEALED"
      ? Math.min(0.96, baseIntensity[state] + confidence * 0.08)
      : baseIntensity[state];
  return { state, ...visualByState[state], intensity };
}

export function isIncidentState(value: string): value is IncidentStateName {
  return ["ACTIVE_INCIDENT", "INVESTIGATED", "ROOT_CAUSE_SUPPORTED", "DATABASE_RESTART_FORBIDDEN", "ROLLBACK_PROPOSED", "AWAITING_HUMAN_AUTHORIZATION", "AUTHORIZED", "ROLLING_BACK", "RECOVERY_VERIFYING", "RECOVERY_VERIFIED", "INCIDENT_CLOSED"].includes(value as IncidentStateName);
}
