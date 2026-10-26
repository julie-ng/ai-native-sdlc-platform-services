# Artifact service contract

> [!IMPORTANT]
> This PR proposes the API and adapter contracts. It implements no product routes, database or Azure integration. New choices are labeled below; the pinned plans are reference material, not acceptance of their proposals.

## The airport model

- The caller arrives at the artifact-service counter with its identity already checked by middleware.
  - Think of `event.context.caller` as the passport and itinerary the counter receives from the trusted system. The caller cannot write its own itinerary into the request body.
- The service already knows which artifacts that caller may create or read.
  - It derives access from trusted context and code policy. A claimed role, a matching filename or knowledge of an artifact ID grants nothing.
- A caller can ask, “What artifacts are available to me?”
  - The service returns the readable artifacts from its own access list. There may be none, one or several; the caller need not know their IDs first.
- An artifact ID selects an item within that access list.
  - It works like a baggage tag, not a passport. A foreign or nonexistent ID receives the same 404 response.
- A SAS URL is a temporary ticket to the actual file in cloud storage.
  - Looking at artifact information does not issue that ticket. The caller requests a download URL only when needed.

## Caller experience

| Request | What happens |
| --- | --- |
| `POST /api/artifacts` | Register a file already written locally, with metadata. Receive an artifact ID and upload SAS URL. |
| `PUT <Azure SAS URL>` | Upload bytes directly to Azure; the artifact API never carries them. |
| `PUT /api/artifacts/{id}` | Report successful upload and completion metadata. |
| `GET /api/artifacts` | Discover artifacts this caller may read. No SAS URLs. |
| `GET /api/artifacts/{id}` | Read one artifact's metadata. No SAS URL. |
| `GET /api/artifacts/{id}/sas` | Obtain a just-in-time download SAS URL. |
| `GET <Azure SAS URL>` | Download bytes directly from Azure. |

- The first handoff is planner P1/execution 1 in run A creating `plan`, followed by coder C1/execution 1 reading it.
  - The planner writes the file locally **before** registration. Its optional title/description can be written by the LLM.
- The three original service responsibilities remain registration, upload completion and read access.
  - The revised resource API exposes five service operations, separating discovery, metadata and SAS retrieval. This follows the architect's review direction; it replaces the earlier three POST action endpoints.
- [examples.json](./examples.json) contains sample calls checked against [OpenAPI](./artifact.openapi.json).
  - Names such as `planner-registers-local-plan` are labels for finding examples. They are not artifact IDs or API inputs; HTTP outcomes are separate fields.

## Trusted middleware context

- Authentication is outside this task. Assume upstream middleware has established `event.context.caller`.
  - No token parser, authentication endpoint, credential fixture, identity provider or assignment resolver is implemented or selected here.
- The artifact service requires the following field, defined as `CallerContext` in OpenAPI and the [TypeScript ports](./artifact-ports.ts):

```ts
// Trusted server context, never an HTTP request body.
event.context.caller = {
  runId,       // caller's workflow run UUID
  stepId,      // caller's logical step UUID
  attemptId,   // caller's execution UUID
  taskType,    // server-established task, e.g. planner or coder
  inputs,      // exact upstream artifact references bound to this execution
  outputs,     // exact own-output references bound to this execution
}
// Each internal reference:
// { runId, producerStepId, producerAttemptId, name }
```

- IDs are canonical lowercase UUID v4 for this slice. Each input/output array has at most 64 references.
  - References must belong to the caller's run; outputs must belong to its own step/attempt. Workflow identity lookups verify the corresponding run → step → execution relationships.
- Missing or malformed context fails closed with 503 `CALLER_CONTEXT_UNAVAILABLE`.
  - `readCallerContext(event.context)` validates the trusted field before any artifact lookup or signing. It does not authenticate anyone, and it never fills missing fields from body/query/header claims.
- An unknown task is denied with 403; a known task can have an empty access list.
  - Caller-context examples are injected directly into test events. They are not mapped from fixed tokens or loaded by production middleware.

## Authorization is ordinary code

- `deriveArtifactAccess(caller)` computes readable and creatable reference sets before artifact queries.
  - Use the intersection of code policy and trusted bindings. De-duplicate exact references; never expand access from request fields.
- This slice proposes the minimal task policy: planner may create `plan`; coder may read `plan`.
  - This is a selected subset of the old illustrative policy, not adoption of the whole coding loop. Every update action and all other task/name capabilities are denied.
- Create uses `name` to select an own-output slot from the trusted creatable set.
  - The service derives the full producer reference. The client supplies no run/step/attempt/owner or replacement permission list. A missing permitted slot is 403.
- Reads and completion use database queries constrained to the caller's permitted references.
  - No unrestricted ID lookup is exposed by the repository port. `findWithinScope(id, references)` matches ID and the exact producer/run/step/name relationship; foreign and missing IDs are both 404.
- A planner's create capability permits completion of its own upload, not reading stored metadata or overwriting bytes.
  - Create/completion responses are small acknowledgments, not database rows. A matching task type in another execution does not share write access.
- Policy and context checks are pure code that can be unit-tested without starting a server.
  - HTTP tests separately check route parsing, status codes and response fields. Denied requests never invoke the SAS issuer; an empty access scope requires no artifact query.

## HTTP behavior

| Operation | Successful result | Important failures |
| --- | --- | --- |
| Create | 201 new reservation; 200 identical reserved repeat. Body: `id`, `state`, `upload` SAS instructions. | 403 ungranted output; 404 missing workflow identity; 409 changed metadata or already uploaded. |
| Complete | 200; body only `id`, `state: uploaded`. | 404 outside own scope/missing; 409 conflicting size/hash. |
| List | 200; `{ artifacts: [...] }`, including an empty list. | 403 unknown task. |
| Metadata | 200; reserved or uploaded artifact information. | 404 outside readable scope/missing. |
| Download SAS | 200; `url`, `method: GET`, `expiresAt`. | 404 outside readable scope/missing; 409 upload not yet acknowledged. |

- Create body: required `name`, `contentType`; optional `kind`, `title`, `description`.
  - Registration atomically reserves `(producerAttemptId, name)` with a server-generated artifact UUID. A repeat must match all metadata, including omitted fields, and returns the same ID with a fresh create-only SAS.
- Completion body: `state: uploaded`, `sizeBytes`, `sha256`.
  - This is a narrowly defined completion command, not a general row replacement. Other state values, metadata edits and arbitrary updates are rejected.
- Complete only after receiving Azure's successful Put Blob response, HTTP 201.
  - First completion atomically records reported size/hash and server time. Identical repeats leave timestamps unchanged; conflicting repeats return 409. Concurrent operations must preserve these outcomes.
- Artifact information includes `id`, `name`, `contentType`, `state`, `createdAt` and any supplied title/description/kind.
  - Uploaded information also includes reported `sizeBytes`, `sha256` and `uploadedAt`—the time the service recorded completion. Reserved information omits those three fields. Neither representation contains a SAS, producer identity or internal reference.
- Discovery returns all existing readable records, reserved or uploaded, ordered by `createdAt`, then `id`, ascending.
  - At most 128 distinct trusted bindings exist in this slice, so the full result is bounded and needs no pagination. Unreserved bindings produce no fake artifact record. Read access is evaluated for every result; there is no single-artifact shortcut.
- Workflow code orders production before consumption; this API introduces no polling requirement.
  - Metadata can describe a reserved artifact, but SAS download issuance requires uploaded state. An ID never bypasses that check.
- A signer failure returns 503 and leaves a valid reservation for retry.
  - Reissuing upload SAS never resets completion or permits overwrite. If Azure upload succeeded but its success response was lost, the caller must not invent completion; recovery requires a new trusted producer execution rather than a byte-probing endpoint in this slice.

## Detailed contract

- [Implementation details](./implementation.md) specify validation/errors, metadata fields, workflow-owned identity/FK prerequisites, SAS behavior, adapter ownership and dependency proposals.
  - [OpenAPI](./artifact.openapi.json) is the machine-readable shape source; [ports](./artifact-ports.ts) are compile-checked design interfaces. No product code is added by this PR.
- On Node 24, run `npm ci`, `npm run check:artifact-contract`, `npm run check:guidance`, `npm run verify` and `git diff --check`.
  - The contract command checks OpenAPI, sample requests/responses, context/seed data and port types. It does not execute authorization or contact Azure/PostgreSQL.

## Choice provenance

| Topic | Source / status |
| --- | --- |
| Direct cloud transfer, three service responsibilities, trusted assignments and exact references | Issue #5 requirements carried from pinned plans. |
| Resource paths; artifact ID in create response; separate metadata/SAS reads; inaccessible ID → 404 | Architect's PR comments and interactive clarification on 2026-10-26. |
| Assume pre-authenticated middleware context; define its shape only | Architect's explicit scope instruction on 2026-10-26; replaces the earlier resolver/token proposal. |
| Airport analogy and server-owned access discovery | Architect's interactive clarification; retained as a design principle. |
| `GET /api/artifacts` discovery shape/order/bound; `event.context.caller` field name and missing-context error | **New proposal**, implementing that principle; not specified by pinned plans. |
| Optional title/description | Architect suggested caller-authored descriptive metadata; **new proposal** for optional title/description fields, limits and persistence. |
| POST/PUT shapes, immutable metadata, repeat/conflict rules, field allowlists and validation limits | **New proposals**, not committed by pinned plans. |
| PostgreSQL 17/Drizzle and original metadata fields/FK | Issue requirements / inherited schema proposal; no deployed database assumed. |
| Code policy instead of grant rows; planner/coder policy subset | Inherited alternatives/illustrative map; **new selections** for this slice. |
| Blob key, 300-second SAS, exact permissions/headers | **New concrete proposals**, constrained by create-only/read-only requirements. |
| Scoped adapter ports, minimal workflow exports/seed, dependency versions | **New proposals**, not previously accepted implementation decisions. |

- Review/merge of this PR remains the decision point for proposals.
  - Production authentication, real credentials and cluster integration are outside this slice. No parent checkout, conversation history, personal memory or running agent is needed to implement the recorded contract.
