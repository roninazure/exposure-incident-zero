<p align="center">
  <img src="docs/assets/exposure-incident-zero.png"
       alt="Exposure // Incident Zero"
       width="100%">
</p>

# EXPOSURE // INCIDENT ZERO

**Governed AI incident response through WebMCP.**

> **Give AI the ability to operate infrastructure without giving AI unrestricted control of infrastructure.**

Exposure lets an AI agent investigate an infrastructure incident, establish safety constraints, propose remediation, request human authorization, execute an approved remediation, and verify recovery—without giving the AI unrestricted control of infrastructure.

Built for the OpenAI WebMCP Challenge.

Live demo: pending final competition deployment.

## Incident Zero

Incident Zero is a deterministic SEV-1 checkout-outage simulation. PostgreSQL initially appears guilty: connection pressure, CPU distress, and replication lag are all visible. The evidence instead identifies a connection-pool misconfiguration in `checkout-api v2.8.14` as the root cause. PostgreSQL is a downstream victim.

The governed response is intentionally constrained:

- PostgreSQL restart is explicitly prohibited.
- The preferred remediation is a rolling rollback from `v2.8.14` to `v2.8.13`.
- The AI cannot authorize its own consequential remediation; human approval is required.
- The rollback proceeds in order: `app-01` → `app-02` → `app-03`.
- Recovery must be verified before the incident can close.

## WebMCP capabilities

Exposure registers these browser-native capabilities through WebMCP:

- `investigate_incident`
- `register_constraint`
- `propose_remediation`
- `request_authorization`
- `execute_rolling_rollback`
- `verify_recovery`

## Authority model

- Exposure is the product.
- WebMCP is the capability layer.
- The AI agent can operate the incident.
- Exposure governs what the agent is allowed to do.
- The AI cannot self-authorize consequential remediation.
- Human approval remains required.

## Architecture

- Browser UI renders the incident and its governed decision points.
- A deterministic incident controller and state machine hold the shared incident state.
- UI actions and WebMCP handlers use the same action/controller path.
- The browser registers tools through `document.modelContext.registerTool`.
- The authorization boundary blocks consequential remediation until human approval.
- Recovery verification validates the required checks before closure.

This competition build is a deterministic incident-response simulation demonstrating the governed interaction model. It does not diagnose arbitrary production infrastructure or perform real SSH, Ansible, or unrestricted infrastructure operations.

## Run and test

Requires Node.js `>=22.13.0` and Linux utilities including `flock`, `curl`, `sha256sum`, and GNU `timeout`.

```sh
npm run install:ci
npm run dev
npm run build
npm test
```

`npm test` runs the build and the repository test suite.

## License

[MIT](LICENSE)
