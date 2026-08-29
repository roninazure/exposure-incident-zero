"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Check, ChevronRight, CircleDot, Clock3, Cloud, Database, GitBranch, GitCommitHorizontal, KeyRound, Layers3, LockKeyhole, Moon, Network, Radar, RotateCcw, Search, Server, ShieldCheck, Sparkles, Sun, TerminalSquare, TriangleAlert, UserRound, X, Zap } from "lucide-react";
import { createIncidentController, type IncidentController } from "./incident-controller";
import type { IncidentState, IncidentStateName } from "./incident-state";
import { createIncidentToolHandlers, INCIDENT_TOOL_DESCRIPTIONS } from "./webmcp-tools";
import { registerWebMcpTools, type WebMcpModelContext, type WebMcpTool } from "./webmcp-registration";
import { getHorizonVisual } from "./horizon";
import { hasConstraintRegistration, hasIncidentEvent, hasRemediationProposal, hasRootCauseSupport } from "./incident-visibility";
import { resolveInitialTheme, toggleTheme, type Theme } from "./theme";
import { getEdgePath, getNodeBounds, getPortPoint, TOPOLOGY_COORDINATE_SYSTEM, TOPOLOGY_EDGES, TOPOLOGY_GROUPS, TOPOLOGY_NODE_BOUNDS, TOPOLOGY_NODES, type TopologyNode } from "./topology-geometry";

type Phase = "investigate" | "investigating" | "decision" | "executing" | "verifying" | "verified";

const eventTitle = (type: string) => ({ incident_created: "Incident created", investigation_started: "Investigation started", evidence_app_abnormality: "App-tier abnormality evidence", evidence_postgresql_distress: "PostgreSQL distress evidence", root_cause_supported: "Root cause supported", investigation_completed: "Investigation completed", constraint_registered: "Constraint registered", remediation_proposed: "Remediation proposed", authorization_requested: "Authorization requested", authorization_approved: "Authorization approved", rollback_started: "Rollback started", rollback_node_completed: "Node rolled back", recovery_verification_started: "Recovery verification started", recovery_verified: "Recovery verified", incident_sealed: "Incident sealed", state_transition: "State transition" } as Record<string, string>)[type] ?? type;

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) { return <span className={`status-pill status-${tone}`}>
<span className="status-dot" />{children}</span>; }
function NodeCard({ node, phase, incident }: { node: TopologyNode; phase: Phase; incident: IncidentState }) { const progress = incident.rollbackProgress.find((item) => item.node === node.id); const status = phase === "verified" ? "healthy" : progress?.healthCheck === "passed" ? "recovered" : node.status; const semanticVisible = hasRootCauseSupport(incident); const semanticLabel = semanticVisible && node.semantic === "root-cause" ? "ROOT" : semanticVisible && node.semantic === "victim" ? "VICTIM" : null; return <div className={`fleet-node node-${status}${semanticLabel ? ` node-${node.semantic}` : ""}`} data-semantic={semanticLabel ? node.semantic : undefined} role="group" aria-label={`${node.id}, ${node.role}${semanticLabel ? `, ${semanticLabel.toLowerCase()}` : ""}`}>
<div className="node-head">
<span className="node-led" />
<span>{node.id}</span>{semanticLabel && <span className="node-semantic-label">{semanticLabel}</span>}{status === "critical" && <TriangleAlert size={13} />}</div>
<div className="node-role">{node.role}</div>
<div className="node-meter">
<span style={{ width: status === "critical" ? "91%" : status === "degraded" ? "68%" : status === "recovered" ? "82%" : "28%" }} />
</div>
</div>; }
function TopologyGraph({ completedRollbackNodes, phase, incident }: { completedRollbackNodes: number; phase: Phase; incident: IncidentState }) { const usedPorts = new Map<string, ReturnType<typeof getPortPoint>>(); TOPOLOGY_EDGES.forEach((edge) => { usedPorts.set(`${edge.from.node}:${edge.from.port}`, getPortPoint(edge.from.node, edge.from.port)); usedPorts.set(`${edge.to.node}:${edge.to.port}`, getPortPoint(edge.to.node, edge.to.port)); }); return <svg className="topology-stage" viewBox={`0 0 ${TOPOLOGY_COORDINATE_SYSTEM.width} ${TOPOLOGY_COORDINATE_SYSTEM.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Nine-node production dependency topology">
<g className="topology-group-layer">{TOPOLOGY_GROUPS.map((group) => <g key={group.id} className="topology-group">
<rect className="topology-group-boundary" x={group.bounds.x} y={group.bounds.y} width={group.bounds.width} height={group.bounds.height} rx="4" />
<text className="topology-group-label" x={group.bounds.x + 8} y={group.bounds.y + 13}>{group.label}</text>
</g>)}</g>
<g className="topology-edge-layer">{TOPOLOGY_EDGES.map((edge, index) => <path className={`topology-edge edge-${index + 1}${edge.remediationStep && completedRollbackNodes >= edge.remediationStep ? " is-remediated" : ""}`} data-edge={edge.id} key={edge.id} d={getEdgePath(edge)} />)}</g>
<g className="topology-port-layer">{Array.from(usedPorts, ([portId, point]) => <circle className="topology-port" data-port={portId} key={portId} cx={point.x} cy={point.y} r="2.5" />)}</g>{TOPOLOGY_NODES.map((node) => { const bounds = getNodeBounds(node); return <foreignObject className="topology-node-frame" data-node={node.id} key={node.id} x={bounds.x} y={bounds.y} width={TOPOLOGY_NODE_BOUNDS.width} height={TOPOLOGY_NODE_BOUNDS.height}>
<NodeCard node={node} phase={phase} incident={incident} />
</foreignObject>; })}</svg>; }

export default function Home() {
  const [controller] = useState<IncidentController>(() => createIncidentController());
  const tools = useMemo(() => createIncidentToolHandlers(controller), [controller]);
  const [incident, setIncident] = useState(controller.getState());
  const [theme, setTheme] = useState<Theme>("light");
  const [themeReady, setThemeReady] = useState(false);
  const actionsRef = useRef<Record<string, () => Promise<unknown>>>({});
  useEffect(() => controller.subscribe(setIncident), [controller]);
  const stateToPhase = (state: IncidentStateName): Phase => state === "ACTIVE_INCIDENT" ? "investigate" : state === "INVESTIGATED" ? "investigating" : state === "ROLLING_BACK" ? "executing" : state === "RECOVERY_VERIFYING" ? "verifying" : state === "RECOVERY_VERIFIED" || state === "INCIDENT_CLOSED" ? "verified" : "decision";
  const phase = stateToPhase(incident.state);
  const horizon = getHorizonVisual(incident);
  const completedRollbackNodes = incident.rollbackProgress.filter((item) => item.rollback === "completed").length;
  const rootCauseSupported = hasRootCauseSupport(incident);
  const constraint = hasConstraintRegistration(incident);
  const remediationProposed = hasRemediationProposal(incident);
  const authorizationRequested = hasIncidentEvent(incident, "authorization_requested");
  const appEvidence = hasIncidentEvent(incident, "evidence_app_abnormality");
  const databasePressure = hasIncidentEvent(incident, "evidence_postgresql_distress");
  const databaseContradiction = hasIncidentEvent(incident, "evidence_database_contradiction");
  const activity = incident.events.at(-1)?.detail ?? "Awaiting investigation";
  const toolCount = incident.events.length;
  const metrics = useMemo(() => incident.state === "RECOVERY_VERIFIED" || incident.state === "INCIDENT_CLOSED" ? { errors: "0.1%", latency: "240ms", db: "126", cpu: "34%", lag: "1.2s" } : { errors: "18.7%", latency: "8.4s", db: "947", cpu: "93%", lag: "42s" }, [incident.state]);
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("exposure-theme");
    const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    const resolvedTheme = resolveInitialTheme(savedTheme, systemPrefersLight);
    document.documentElement.dataset.theme = resolvedTheme;
    const frame = window.requestAnimationFrame(() => {
      setTheme(resolvedTheme);
      setThemeReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("exposure-theme", theme);
  }, [theme, themeReady]);
  const investigate = async () => controller.investigateIncident(undefined, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800);
  const authorize = async () => controller.authorizeRollback();
  const execute = async () => { await controller.executeRollingRollback(undefined, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800); };
  useEffect(() => { actionsRef.current = Object.fromEntries(Object.entries(tools).map(([name, execute]) => [name, async () => execute()])); }, [tools]);
  useEffect(() => { let attempts = 0; let timer: number | undefined; let cancelled = false; const register = async () => { if (cancelled) return; const modelContext = (document as Document & { modelContext?: WebMcpModelContext }).modelContext; const tools = Object.entries(INCIDENT_TOOL_DESCRIPTIONS).map(([name, description]) => ({ name, description, inputSchema: { type: "object", properties: {} }, execute: () => actionsRef.current[name]?.() }) satisfies WebMcpTool); const registered = modelContext?.registerTool ? await registerWebMcpTools(modelContext, tools) : new Set<string>(); if (!cancelled && registered.size < tools.length && attempts++ < 5) timer = window.setTimeout(() => { void register(); }, 100); }; void register(); return () => { cancelled = true; if (timer) window.clearTimeout(timer); }; }, []);
  const phaseLabel = phase === "investigate" ? "Investigation" : phase === "investigating" ? activity : incident.state === "AWAITING_HUMAN_AUTHORIZATION" ? "Authorization pending" : incident.state === "AUTHORIZED" ? "Authorized · execution available" : phase === "decision" ? "Decision required" : phase === "executing" ? "Rollback in progress" : phase === "verifying" ? "Recovery verification" : incident.state === "INCIDENT_CLOSED" ? "Incident sealed" : "Recovery verified";
  return <main className={`exposure-shell horizon-${horizon.atmosphere} light-${horizon.lightPosition}`}>
    <div className="horizon-band" style={{ opacity: horizon.intensity }} aria-hidden="true" />
    <nav className="global-nav" aria-label="Global navigation">
<span className="global-nav-mark">EX</span>
<span className="global-nav-line" />
<span className="global-nav-icon active" aria-label="Incident Zero">
<CircleDot size={15} />
</span>
<span className="global-nav-icon" aria-label="Fleet map">
<Network size={15} />
</span>
<span className="global-nav-icon" aria-label="Evidence">
<Database size={15} />
</span>
<span className="global-nav-icon" aria-label="Decision trace">
<GitCommitHorizontal size={15} />
</span>
</nav>
    <header className="topbar">
<div className="brand-lockup">
<div className="brand-mark">
<Radar size={18} />
</div>
<div>
<div className="brand-name">EXPOSURE</div>
<div className="brand-sub">Operational intelligence</div>
</div>
</div>
<div className="topbar-center">
<span className="live-indicator" /> LIVE SIMULATION <span className="topbar-divider" /> INCIDENT ZERO</div>
<div className="topbar-right">
<span className="environment">
<Cloud size={14} /> enterprise-linux-9</span>
<button className="icon-button" aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(toggleTheme(theme))}>{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</button>
<button className="icon-button" aria-label="Reset incident" onClick={() => controller.reset()}>
<RotateCcw size={16} />
</button>
<div className="avatar">
<UserRound size={15} />
</div>
</div>
</header>
    <section className="incident-strip">
<div className="incident-title">
<div className="eyebrow">{incident.state === "INCIDENT_CLOSED" ? "INCIDENT SEALED" : "SEV-1 / ACTIVE INCIDENT"}</div>
<h1>Checkout degradation across production</h1>
<p>Database pressure is visible. The causal signal is one layer upstream.</p>
</div>
<div className="incident-stats">
<div>
<span>Customer impact</span>
<strong className={phase === "verified" ? "good" : "bad"}>{phase === "verified" ? "Ended" : "Critical"}</strong>
</div>
<div>
<span>Opened</span>
<strong>09:41 UTC</strong>
</div>
<div>
<span>Fleet</span>
<strong>{phase === "verified" ? "9 / 9 healthy" : "6 / 9 healthy"}</strong>
</div>
</div>
<div className="phase-block">
<StatusPill tone={phase === "verified" ? "success" : phase === "executing" || phase === "investigating" || phase === "verifying" ? "warn" : "critical"}>{phaseLabel}</StatusPill>
<div className="phase-progress">
<span className={phase !== "investigate" ? "done" : "active"} />
<span className={phase === "decision" || phase === "executing" || phase === "verified" ? "done" : ""} />
<span className={phase === "executing" || phase === "verified" ? "done" : ""} />
<span className={phase === "verified" ? "done" : ""} />
</div>
<div className="phase-copy">{toolCount} tool calls recorded</div>
</div>
</section>
    <section className="workspace-grid">
<aside className="object-rail panel">
<div className="eyebrow">OBJECTS</div>
<div className="object-search">⌕ Search objects</div>
<div className="object-tabs">
<span>ALL 78</span>
<span className="active">IMPACTED 12</span>
<span>WATCH 5</span>
</div>
<div className="object-group">
<b>RELEASES</b>
<span>◈ checkout-api <small>v2.8.14</small>
</span>
<span>◈ payments-svc <small>v2.8.16.3</small>
</span>
</div>
<div className="object-group">
<b>SERVICES</b>
<span className="critical-text">● checkout-api</span>
<span>● inventory-svc</span>
<span>● billing-svc</span>
<span>● payments-svc</span>
</div>
<div className="object-group">
<b>DATA STORES</b>
<span className="critical-text">● checkout-db</span>
<span>● redis-cache</span>
<span>● customer-db</span>
</div>
<div className="object-group">
<b>INFRASTRUCTURE</b>
<span>● k8s-prod-us-east-1a</span>
<span>● rds-cluster-1</span>
<span>● vpc-prod</span>
</div>
</aside>
<div className="main-column">
<article className="panel topology-panel">
<div className="panel-heading">
<div>
<div className="eyebrow">DEPENDENCY GRAPH</div>
<h2>Incident propagation surface</h2>
</div>
<div className="heading-actions">
<StatusPill tone={phase === "verified" ? "success" : "warn"}>
<Activity size={13} /> {phase === "verified" ? "Stable" : "Degraded"}</StatusPill>
<button className="ghost-button">
<Layers3 size={14} /> Focus path</button>
</div>
</div>
<div className={`topology-canvas propagation-${completedRollbackNodes}`}>
<TopologyGraph completedRollbackNodes={completedRollbackNodes} phase={phase} incident={incident} />
{rootCauseSupported && <div className="root-callout">
<TriangleAlert size={14} />
<span>
<b>ROOT CAUSE</b> checkout-api v2.8.14</span>
</div>}
{rootCauseSupported && <div className="symptom-callout">
<Database size={14} />
<span>
<b>VICTIM</b> db-primary / PostgreSQL</span>
</div>}
</div>
<div className="topology-legend">
<span>
<i className="legend-dot healthy" /> healthy</span>
<span>
<i className="legend-dot degraded" /> degraded</span>
<span>
<i className="legend-dot critical" /> causal signal</span>
<span className="legend-note">
<Network size={13} /> dependency edges are live</span>
</div>
</article>
<div className="lower-grid">
<article className="panel evidence-panel">
<div className="panel-heading compact">
<div>
<div className="eyebrow">EVIDENCE STREAM</div>
<h2>Signals connected</h2>
</div>
<span className="stream-live">
<span className="pulse" /> streaming</span>
</div>
{appEvidence || databasePressure || databaseContradiction || rootCauseSupported ? <div className="evidence-list">
<div className="evidence-item">
<div className="evidence-icon amber">
<GitCommitHorizontal size={15} />
</div>
<div>
<b>App-tier abnormality detected</b>
<p>checkout-api v2.8.14 shows abnormal connection-pool behavior</p>
</div>
<span className="evidence-time">3m</span>
</div>
{databasePressure && <div className="evidence-item">
<div className="evidence-icon red">
<Database size={15} />
</div>
<div>
<b>PostgreSQL connection pressure observed</b>
<p>126 → 947 active sessions</p>
</div>
<span className="evidence-time">2m</span>
</div>}
{databaseContradiction && <div className="evidence-item">
<div className="evidence-icon blue">
<Zap size={15} />
</div>
<div>
<b>Database hypothesis challenged</b>
<p>No PostgreSQL/database change occurred in the release window</p>
</div>
<span className="evidence-time">1m</span>
</div>}
{rootCauseSupported && <>
<div className="evidence-item">
<div className="evidence-icon amber">
<GitCommitHorizontal size={15} />
</div>
<div>
<b>Root cause supported</b>
<p>checkout-api v2.8.14 · connection-pool misconfiguration</p>
</div>
<span className="evidence-time">now</span>
</div>
</>}
</div>
 : <div className="evidence-list"><div className="evidence-item"><div className="evidence-icon blue"><Activity size={15} /></div><div><b>Raw telemetry</b><p>Checkout and PostgreSQL distress signals captured</p></div></div></div>}
<button className="text-button">Open evidence ledger <ChevronRight size={14} />
</button>
</article>
<article className="panel metrics-panel">
<div className="panel-heading compact">
<div>
<div className="eyebrow">HEALTH OVERVIEW</div>
<h2>Impact measures</h2>
</div>
<Clock3 size={16} className="muted-icon" />
</div>
<div className="metric-grid">
<div>
<span>HTTP 502 rate</span>
<strong className={phase === "verified" ? "good" : "bad"}>{metrics.errors}</strong>
<small>{phase === "verified" ? "−18.6 pp" : "+18.6 pp"}</small>
</div>
<div>
<span>P95 latency</span>
<strong>{metrics.latency}</strong>
<small>{phase === "verified" ? "−8.16 s" : "+8.16 s"}</small>
</div>
<div>
<span>DB connections</span>
<strong>{metrics.db}</strong>
<small>active sessions</small>
</div>
<div>
<span>Replication lag</span>
<strong>{metrics.lag}</strong>
<small>db-replica</small>
</div>
</div>
<div className="sparkline">
<span />
<span />
<span />
<span />
<span />
<span />
<span className={phase === "verified" ? "recovered" : ""} />
</div>
</article>
</div>
</div>
<aside className="side-column">
<article className="panel service-detail">
<div className="eyebrow">SERVICE DETAILS</div>
<div className="service-name">
<span className="service-glyph">⬡</span>
<div>
<h2>checkout-api</h2>
<span className="critical-text">● IMPACTED</span>
</div>
</div>
<dl>
<dt>Owner</dt>
<dd>Payments Platform</dd>
<dt>Team</dt>
<dd>payments-eng</dd>
<dt>Environment</dt>
<dd>prod</dd>
<dt>Version</dt>
<dd>v2.8.14</dd>
</dl>
{rootCauseSupported && <div className="service-note">
<b>Supported root cause</b>
<span>Connection-pool misconfiguration</span>
<small>PostgreSQL is the downstream victim.</small>
</div>}
</article>
<article className="panel decision-panel">
<div className="eyebrow">DECISION CHAMBER</div>
<div className="decision-head">
<h2>What is actually failing?</h2>
{rootCauseSupported ? <span className="confidence">94% <small>confidence</small>
</span>
 : <span className="confidence">— <small>pending</small></span>}
</div>
{!rootCauseSupported && <div className="hypothesis muted"><div className="hypothesis-mark"><Search size={14} /></div><div><b>{databaseContradiction ? "Database hypothesis challenged" : databasePressure ? "PostgreSQL under severe pressure" : appEvidence ? "Application anomaly under investigation" : "Investigation pending"}</b><p>{databaseContradiction ? "The database is unhealthy, but no database change explains the incident." : databasePressure ? "PostgreSQL is a downstream system under pressure; causality remains open." : appEvidence ? "The application tier is showing abnormal connection-pool behavior." : "Hypotheses unresolved until evidence is correlated."}</p></div></div>}
{rootCauseSupported && <>
<div className="hypothesis primary">
<div className="hypothesis-mark">
<Check size={14} />
</div>
<div>
<b>Checkout deployment regression</b>
<p>Connection pool misconfiguration in v2.8.14</p>
</div>
<span className="hypothesis-score">0.94</span>
</div>
<div className="hypothesis muted">
<div className="hypothesis-mark">
<X size={14} />
</div>
<div>
<b>PostgreSQL resource failure</b>
<p>Downstream pressure, no causal change found</p>
</div>
<span className="hypothesis-score">0.21</span>
</div>
<div className="hypothesis muted">
<div className="hypothesis-mark">
<X size={14} />
</div>
<div>
<b>Network degradation</b>
<p>No correlated packet loss or route changes</p>
</div>
<span className="hypothesis-score">0.08</span>
</div>
{constraint && <div className="constraint-card">
<div className="constraint-title">
<LockKeyhole size={14} /> HUMAN CONSTRAINT <StatusPill tone={constraint ? "success" : "neutral"}>{constraint ? "enforced" : "not registered"}</StatusPill>
</div>
<p>PostgreSQL restart is prohibited for this incident.</p>
<button className="constraint-toggle" onClick={() => controller.registerConstraint("restart_postgresql")}>
<span className={constraint ? "toggle-on" : ""} />
<span>{constraint ? "Constraint active" : "Register constraint"}</span>
</button>
</div>}
</>}
</article>
<article className={`panel action-panel ${incident.state === "AWAITING_HUMAN_AUTHORIZATION" ? "authorization-pending" : ""}`}>
<div className="eyebrow">GOVERNED ACTION</div>
{remediationProposed ? <>
<div className="action-title">
<div className="action-icon">
<GitBranch size={17} />
</div>
<div>
<h2>Rolling rollback</h2>
<p>checkout-api · v2.8.14 → v2.8.13</p>
</div>
</div>
<div className="action-meta">
<span>
<Server size={13} /> 3 targets</span>
<span>
<ShieldCheck size={13} /> no database action</span>
</div>
</> : <div className="action-title"><div className="action-icon"><Search size={17} /></div><div><h2>Remediation pending</h2><p>Awaiting investigation.</p></div></div>}
<div className={`recovery-status ${phase === "verified" ? "is-verified" : ""}`}>
<ShieldCheck size={14} />
<span>
<b>{phase === "verified" ? "Recovery verified" : phase === "verifying" ? "Verifying recovery" : remediationProposed ? "Recovery status" : phase === "investigating" ? "Investigation in progress" : "Investigation status"}</b>{phase === "verified" ? " All deterministic checks passed." : phase === "verifying" ? " Checking deterministic health thresholds." : remediationProposed ? " Verification pending after authorized rollback." : phase === "investigating" ? " Following the production dependency chain." : " Awaiting investigation."}</span>
</div>{phase === "investigate" && <button className="primary-button" onClick={investigate}>
<Search size={16} /> Run investigation <ArrowRight size={16} />
</button>}{phase === "decision" && incident.state === "AWAITING_HUMAN_AUTHORIZATION" && <button className="primary-button approval-button" onClick={authorize}>
<KeyRound size={16} /> Approve rollback <ArrowRight size={16} />
</button>}{phase === "decision" && incident.state === "AUTHORIZED" && <button className="primary-button" onClick={execute}>
<GitBranch size={16} /> Begin rolling rollback <ArrowRight size={16} />
</button>}{phase === "executing" && <div className="execution-state">
<span className="spinner" /> Rolling back app-01 → app-02 → app-03</div>}{phase === "verifying" && <div className="execution-state">
<span className="spinner" /> Verifying recovery thresholds</div>}{phase === "verified" && <div className="verified-state">
<ShieldCheck size={18} />
<div>
<b>Recovery proven</b>
<span>All verification gates passed</span>
</div>
</div>}<div className="action-foot">
<LockKeyhole size={12} /> Consequential actions require operator approval</div>
</article>
<article className="panel agent-panel">
<div className="agent-top">
<div className="agent-avatar">
<Sparkles size={15} />
</div>
<div>
<div className="eyebrow">AGENT ACTIVITY</div>
<h2>Exposure reasoning trace</h2>
</div>
</div>
<div className="agent-message">
<span className="quote-mark">“</span>
<p>{activity}</p>
</div>
<div className="agent-tool">
<TerminalSquare size={14} />
<span>WebMCP tool layer</span>
<StatusPill tone="success">connected</StatusPill>
</div>
</article>
</aside>
<section className="timeline-section">
<div className="timeline-heading">
<div>
<div className="eyebrow">OPERATIONAL TIMELINE</div>
<h2>Every decision leaves a trace</h2>
</div>
<button className="ghost-button">
<GitCommitHorizontal size={14} /> Export incident record</button>
</div>
<div className="timeline-track">{incident.events.map((item) => <div className={`timeline-event ${item.type.includes("error") ? "critical" : item.type.includes("completed") || item.type.includes("verified") || item.type.includes("sealed") ? "success" : "info"}`} key={item.id}>
<span className="timeline-marker" />
<span className="timeline-time">{item.at}</span>
<b>{eventTitle(item.type)}</b>
<p>{item.detail}</p>
</div>)}</div>
</section>
</section>
    <footer className="footer-bar">
<span>
<CircleDot size={13} /> EXPOSURE / INCIDENT ZERO</span>
<span>SIMULATED ENVIRONMENT <i /> REAL WEBMCP TOOLS <i /> HUMAN AUTHORITY REQUIRED</span>
<span>v0.1.0 · deterministic demo</span>
</footer>
  </main>;
}
