# Artifact service — POC contract

> [!IMPORTANT]
> Contracts and documentation only; no product API or integration exists yet. The architect's review decisions below supersede the original issue's attempt-specific, universally create-only requirements. The pinned plans are references; [choice sources](../api/README.md#choice-sources) distinguish agreed rules from new proposals.

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
| Caller | Whoever is making the current service request, using middleware-established context. | Planner registering; coder downloading. |
| Name | Logical artifact slot, not a filename or permission. | `plan`, not `plan.md`. |
| SAS URL | A temporary cloud-storage capability scoped to one blob and permitted actions. | Upload or download URL. |

## Purpose: the airport counter

- Middleware has checked the caller's “passport”; the service receives its trusted itinerary in `event.context.caller`.
  - The service owns the access list. A caller can discover zero, one or several available artifacts without knowing IDs first; an ID only selects within that list.
- The artifact service owns metadata; cloud storage owns bytes.
  - A SAS URL is the temporary ticket to those bytes. Metadata/discovery reads do not issue that ticket automatically.

## Agreed POC rules

- One artifact ID and one blob per producing step/name, reused across retries and repeated writes.
  - No attempt IDs in artifact ownership, references or caller context. No per-attempt records, blob keys, logs or artifact revision history.
- The planner can create and overwrite its own plan; a later execution of the same step can continue editing it.
  - A different step cannot overwrite it by default. Matching task type alone grants nothing; read, create and update capabilities stay distinct.
- Each successful-upload acknowledgment replaces the latest size/hash and last-acknowledgment time.
  - Only the current values are stored. Consumers read after the producing step finishes.
- Assume one active writer per step and no overlapping executions.
  - This is an operating assumption, not service-enforced isolation. No locks, leases or concurrent-writer coordination are required for this POC.
- Authentication is outside this task; upstream middleware supplies caller context.
  - The service checks its required shape and fails closed if missing. Do not implement a token parser, identity provider or assignment resolver.

## Caller flow

| Action | Request |
| --- | --- |
| Register an already-local file, or renew its upload URL | `POST /api/artifacts` → same artifact ID + scoped upload SAS |
| Write or overwrite directly in Azure | `PUT <SAS URL>`; bytes bypass the service |
| Report successful upload | `PUT /api/artifacts/{id}` → completion acknowledgment |
| Discover readable artifacts | `GET /api/artifacts` → metadata list, no SAS |
| Inspect one artifact | `GET /api/artifacts/{id}` → metadata, no SAS |
| Obtain download access when needed | `GET /api/artifacts/{id}/sas` → read SAS |

- Planner P1 in run A writes its plan locally before registering it, optionally with a title/description authored by the LLM.
  - It may write that same artifact repeatedly, reusing an unexpired SAS or obtaining a fresh one. After Azure success it reports completion; coder C1 later reads the latest plan.
- Completion reports metadata, not independently verified cloud content.
  - Foreign and missing IDs both return 404. HTTP claims cannot replace roles, ownership or permissions from trusted context.

## Implementable contract

- Start with the [overview](../api/README.md), then [implementation details](../api/implementation.md).
  - [OpenAPI](../api/artifact.openapi.json), [checked examples](../api/examples.json), [test contexts/identities](../api/caller-contexts.fixture.json) and [TypeScript ports](../api/artifact-ports.ts) define exact shapes. Example names are labels, not artifact IDs.
- Caller context is `{ runId, stepId, taskType, inputs, outputs }`; internal references are `{ runId, producerStepId, name }`.
  - The service derives producer identity from an own-output binding. Public reads use IDs within trusted readable scope; bindings point to a step's current artifact, not to a historical execution.
- Planned persistence is PostgreSQL 17 + Drizzle; no deployed database is assumed.
  - Proposed FK: `producerStepId -> steps(id)`; unique producing step/name. Workflow owns minimal run/step identities and migrations, without requiring workflow endpoints or an attempts table for this slice.

## Delivery after contract merge

1. Implement pure context/policy functions and resource routes against injected adapters.
   - Unit tests need no server. Cover same-step repeat writes, different-step denials, latest completion, discovery without signing and response allowlists.
2. Supply workflow-owned run/step identities, then artifact migrations and disposable PostgreSQL 17 tests.
   - Prove the step FK, unique step/name, stable IDs and restart durability; do not build attempt tracking or overlapping-writer coordination.
3. Exercise real Azure upload, overwrite, acknowledgment and download with separately supplied service credentials.
   - Prove the same blob is reused, latest bytes/hash match, create-only capabilities cannot overwrite, and read-only capabilities cannot write. Fake URLs and builds do not prove this.
4. Integrate production middleware/context delivery and cluster execution later.
   - Broader workflow endpoints, attempt logging, Kubernetes/Argo, GitHub broker, webhook ingress, UI and LLM calls remain outside this slice.

## Verification

- On Node 24: `npm ci`, `npm run check:artifact-contract`, `npm run check:guidance`, `npm run verify`, `git diff --check`.
  - Contract checks validate schemas, examples, seed consistency and port types. Real authorization, PostgreSQL and Azure behavior need implementation tests.
- The [workflow reference](./workflow-service.md) preserves broader planning ideas, not additional POC requirements.
  - No external checkout, parent temporary files, conversation history or personal memory is required to implement the recorded contract.
