# Artifact service — POC contract

> [!IMPORTANT]
> The [API contract](../api/README.md) defines the current POC; [implementation details](../api/implementation.md) cover persistence and storage. Routes, guards, PostgreSQL queries and Azure SAS signing are implemented; the SAS functions were verified against Azure. Caller authentication and route-level Azure verification remain. Accepted refinements are recorded in the [decision log](../architecture.md#decision-log).

## Ontology

| Term | Meaning here | Example |
| --- | --- | --- |
| Run | One workflow instance. | Run A. |
| Step | A logical task within a run; the artifact ownership boundary. | Planner step P1; coder step C1. |
| Attempt | One execution of a step; not an artifact identity or log in this POC. | A retry of P1 still uses P1's artifact. |
| Task type | The kind of work; informs policy but grants no access by itself. | `planner`, `coder`. |
| Artifact | The current file and its metadata, with one stable ID per producing step/name. | P1's `plan`. |
| Producer | The step that owns/creates an artifact; its executing agent writes the file. | P1 produces the plan. |
| Consumer | A caller permitted to read that artifact. | C1 consumes P1's plan. |
| Caller | Whoever is making the current service request, using context established by the step context guard. | Planner requesting upload access; coder downloading. |
| Name | Logical artifact slot, not a filename or permission. | `plan`, not `plan.md`. |
| SAS URL | A temporary cloud-storage capability scoped to one blob and permitted actions. | Upload or download URL. |

## Purpose: the airport counter

- The `requireStepContext` guard, called explicitly by each route, checks the caller's “passport” and records the trusted itinerary in `event.context.step`.
  - The service owns the access list. A caller can discover zero, one or several available artifacts without knowing IDs first; an ID only selects within that list.
- The artifact service owns metadata; cloud storage owns bytes.
  - A SAS URL is the temporary ticket to those bytes. Metadata/discovery reads do not issue that ticket automatically.

## Agreed POC rules

- One artifact ID and one blob per producing step/name, reused across retries and repeated writes.
  - No attempt IDs in artifact ownership, references or step context. No per-attempt records, blob keys, logs or artifact revision history.
- The planner can create and overwrite its own plan; a later execution of the same step can continue editing it.
  - A different step cannot overwrite it by default. Matching step role alone grants nothing; read, create and update capabilities stay distinct.
- Each successful-upload acknowledgment replaces the latest size/hash and last-acknowledgment time.
  - Only the current values are stored. Consumers read after the producing step finishes.
- Assume one active writer per step and no overlapping executions.
  - This is an operating assumption, not service-enforced isolation. No locks, leases or concurrent-writer coordination are required for this POC.
- Authentication is outside this task; the step context guard will construct the context (#13).
  - The service checks its required shape and binding consistency and fails closed if missing. Consume complete trusted context directly; defer workflow-step lookup, token parsing and context construction. HMAC versus Kubernetes ServiceAccount authentication remains undecided. Tests inject fixed server-owned context without production auth bypasses.

## Caller flow

| Action | Request |
| --- | --- |
| Request a fresh upload SAS for a local artifact | `POST /api/artifacts` → same artifact ID + scoped upload SAS |
| Write or overwrite directly in Azure | `PUT <SAS URL>`; bytes bypass the service |
| Report upload outcome (uploaded or failed) | `PUT /api/artifacts/{id}` → acknowledgment |
| Discover readable artifacts | `GET /api/artifacts` → metadata list, no SAS |
| Inspect one artifact | `GET /api/artifacts/{id}` → metadata, no SAS |
| Obtain download access when needed | `GET /api/artifacts/{id}/sas` → read SAS |

- Planner P1 in run A writes its plan locally before requesting upload access, optionally with a title/description authored by the LLM.
  - It may write that same artifact repeatedly, reusing an unexpired SAS or obtaining a fresh one. After Azure success it reports completion; coder C1 later reads the latest plan.
- Completion reports metadata, not independently verified cloud content.
  - Missing artifacts or no granted access return 404; an existing accessible artifact with the wrong action returns 403. HTTP claims cannot replace roles, ownership or permissions from trusted context.

## Implementation map

- Read the applicable [server](../../server/AGENTS.md), [database](../../server/db/AGENTS.md) and [shared](../../shared/AGENTS.md) instructions before changing artifact code.
- Start with the [overview](../api/README.md), then [implementation details](../api/implementation.md). [OpenAPI](../api/artifact.openapi.json) and [shared types](../../shared/types/artifact.ts) define exact shapes.
- Step context is `{ runId, stepId, role, inputs, outputs }`; internal references are `{ runId, producerStepId, name }`. Registration derives the producing step from the caller; bindings point to a step's current artifact, not a historical execution.
- Artifacts keep `createdAt` and `updatedAt`. Every accepted write (repeated POST or upload report) refreshes `updatedAt`; reads and denials do not.

| Piece | Location | Tests |
| --- | --- | --- |
| Routes | `server/api/artifacts/` | Authenticated production-build flow checked locally against Azure (#41); HTTP checks remain manual |
| Guards (step context, configuration, 404/403) | `server/utils/guards/` | Unit tests; access lookups via `npm run test:db` |
| Policy | `server/utils/artifact/policy.utils.ts` | Unit tests |
| PostgreSQL repository and migrations | `server/utils/artifact/repository.utils.ts`, `server/db/` | `npm run test:db` against disposable PostgreSQL 17 |
| Azure user delegation SAS | `server/utils/artifact/azure-sas.utils.ts` | Offline signing with a fixed test key; checked once against Azure by hand (#20) |

## Remaining work

1. HMAC authentication and admin run creation are implemented in #41, with direct guard tests and PostgreSQL integration tests. The temporary local stub is removed.
2. Static checks now require artifact routes to await their authentication guard and run routes to call their admin guard before input reads (#19); only the documented JSON 404 catch-all is allow-listed as unguarded. The proposed additional HTTP testing layer (#42) was declined; use existing testing patterns and manual HTTP checks.
3. Deployment artifacts (image, CI publish, manifests, startup migrations) exist (#45); workload identity and execution in the cluster remain unverified. Local live verification is recorded in the README.
4. Broader workflow endpoints, attempt logging, GitHub broker, webhook ingress, UI and LLM calls remain outside this slice. The [workflow reference](./workflow-service.md) preserves broader planning ideas, not POC requirements.
