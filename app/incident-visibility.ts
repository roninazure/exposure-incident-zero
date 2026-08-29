import type { IncidentState, IncidentStateName } from "./incident-state";

const statesAtOrAfter = (state: IncidentStateName, states: IncidentStateName[]) =>
  states.includes(state);

export function hasIncidentEvent(incident: IncidentState, type: string): boolean {
  return incident.events.some((item) => item.type === type);
}

export function hasRootCauseSupport(incident: IncidentState): boolean {
  return incident.hypotheses.some((item) => item.role === "root_cause" && item.status === "supported")
    && (incident.state !== "ACTIVE_INCIDENT" || hasIncidentEvent(incident, "root_cause_supported"));
}

export function hasConstraintRegistration(incident: IncidentState): boolean {
  return incident.constraints.some((item) => item.action === "restart_postgresql")
    && hasIncidentEvent(incident, "constraint_registered");
}

export function hasRemediationProposal(incident: IncidentState): boolean {
  return hasIncidentEvent(incident, "remediation_proposed")
    || statesAtOrAfter(incident.state, ["ROLLBACK_PROPOSED", "AWAITING_HUMAN_AUTHORIZATION", "AUTHORIZED", "ROLLING_BACK", "RECOVERY_VERIFYING", "RECOVERY_VERIFIED", "INCIDENT_CLOSED"]);
}
