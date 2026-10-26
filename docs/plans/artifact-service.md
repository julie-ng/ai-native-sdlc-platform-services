# Artifact service — contract baseline

> [!IMPORTANT]
> Contract/documentation only; no product API or integration exists yet. The [pinned plan](https://github.com/julie-ng/ai-native-sdlc-platform-services/blob/67c4f98d81c2a96d4f80c0bc8ecaf25a985ede6e/docs/plans/artifact-service.md) is reference material. [Provenance](../api/README.md#choice-provenance) labels new proposals and subsequent architect instructions.

## Purpose: the airport counter

- Middleware has already checked the caller's “passport” and supplies trusted caller context.
  - Authentication is outside this task. The artifact service defines the required context and fails closed if it is missing.
- The service owns the access list, like the airport owns the passenger's itinerary.
  - The caller can discover its available artifacts without knowing IDs. There can be none, one or several; an ID only selects within authorized access.
- Artifact information and the file itself are separate.
  - The service owns metadata; cloud storage owns bytes. A SAS URL is the temporary ticket to those bytes, requested separately from metadata reads.

## Caller flow

| Action | Service request |
| --- | --- |
| Register a file already written locally | `POST /api/artifacts` → artifact ID + upload SAS URL |
| Upload directly to Azure | `PUT <SAS URL>`; bytes bypass the service |
| Report successful upload | `PUT /api/artifacts/{id}` → completion acknowledgment |
| Discover readable artifacts | `GET /api/artifacts` → metadata list, no SAS URLs |
| Inspect one artifact | `GET /api/artifacts/{id}` → metadata, no SAS URL |
| Obtain file access when needed | `GET /api/artifacts/{id}/sas` → download SAS URL |

- The planner writes its plan locally, then registers it with metadata, optionally including an LLM-authored title/description.
  - After Azure returns successful upload, it reports completion. Recording completion does not grant byte-overwrite permission or independently verify Azure content.
- The coder discovers its permitted inputs, inspects metadata and requests a download SAS only when needed.
  - Foreign and missing IDs both return 404. Caller-provided roles, producer IDs or permissions cannot expand the server-owned scope.

## Implementable contract

- Start with the [overview and trust model](../api/README.md), then [implementation details](../api/implementation.md).
  - [OpenAPI](../api/artifact.openapi.json), [checked examples](../api/examples.json), [test context/identity data](../api/caller-contexts.fixture.json) and [TypeScript ports](../api/artifact-ports.ts) specify the exact shapes. Example names are navigation labels, not artifact IDs.
- Trusted `event.context.caller` contains `{ runId, stepId, attemptId, taskType, inputs, outputs }`.
  - Internal references are `{ runId, producerStepId, producerAttemptId, name }`. Create derives producer identity from an own-output binding; public reads use artifact IDs within trusted readable scope.
- First handoff: planner P1/execution 1 in run A creates logical `plan`; coder C1/execution 1 reads that exact output.
  - Changed runs, producers, executions, names and actions are denied. Same-task callers do not share writes. Additional examples demonstrate multiple readable inputs without assuming a single result.
- Planned persistence is PostgreSQL 17 + Drizzle in the `workflow` database; no deployed database is assumed.
  - Preserve unique producer-execution/name and `producerAttemptId -> step_attempts(id)`. Workflow owns the minimal run/step/attempt schema and seed data; artifact code must not create competing workflow tables or remove the FK.
- URLs are generated, not stored. Service credentials stay server-side; callers receive only scoped SAS URLs.
  - Create/read/update remain distinct. Completion changes status metadata only; artifact-content updates stay denied.

## Delivery after contract merge

1. Implement pure context/policy functions and resource routes against injected metadata/signer adapters.
   - Unit tests need no server. HTTP tests prove parsing, response allowlists and scoped behavior, including discovery without signing and foreign-ID denials.
2. Supply workflow-owned minimal identities, then artifact migrations/adapters and disposable PostgreSQL 17 tests.
   - Prove FK/uniqueness, atomic repeats/conflicts and restart durability without implementing workflow endpoints.
3. Exercise the real direct Azure handoff outside Kubernetes with separately supplied service credentials.
   - Compare uploaded/downloaded bytes and prove SAS read/create/overwrite boundaries. Fake URLs and builds do not prove a Blob handoff.
4. Integrate production middleware/context delivery and cluster execution later.
   - Kubernetes/Argo, workflow endpoints, GitHub broker, webhook ingress, product UI, LLM calls and artifact-content updates remain outside this slice.

## Verification

- On Node 24: `npm ci`, `npm run check:artifact-contract`, `npm run check:guidance`, `npm run verify`, `git diff --check`.
  - Contract checks validate schemas, examples, seed consistency and design-port types. Actual authorization, PostgreSQL and Azure behavior still need implementation tests.
- The [workflow reference](./workflow-service.md) preserves broader planning context; it does not adopt that service's open proposals.
  - This repository contains the facts needed for this slice. External ADRs, parent temporary files, conversation history and personal memory are not required inputs.
