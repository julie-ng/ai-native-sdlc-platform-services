# Artifact service contract

> [!IMPORTANT]
> Merged PR #12 is the authoritative contract. The [executable foundation](./foundation.md) implements schemas, context/policy utilities and exported ports; routes, database and Azure integration remain pending. [Choice sources](#choice-sources) preserve the proposal/review provenance; merge settled those choices for implementation. The later [schema review decision](../architecture.md#decision-log) supersedes the OpenAPI-first tooling: handwritten Zod domain schemas and TypeScript HTTP definitions now generate OpenAPI.

- [Ontology](../plans/artifact-service.md#ontology) defines run, step, attempt, artifact, producer, consumer and caller.
  - The step owns the artifact. An agent execution writes it; retries do not create a different artifact.

## The airport model

- Middleware has checked the caller's passport and supplies its trusted itinerary in `event.context.caller`.
  - The service already knows which artifacts the caller can read, create or update. A claimed role or matching filename grants nothing.
- A caller can ask, “What artifacts are available to me?”
  - Discovery returns zero, one or several readable artifacts; the caller need not know their IDs first.
- An artifact ID selects an item within that access list, like a baggage tag rather than a passport.
  - Missing artifacts and artifacts with no granted action receive the same 404. If the artifact exists and the caller has some access but lacks the requested action, return 403. Knowing an ID never grants access.
- A SAS URL is the temporary ticket to the actual file in cloud storage.
  - Metadata reads do not issue that ticket. Obtain a download SAS only when needed.

## Caller experience

| Request | Result |
| --- | --- |
| `POST /api/artifacts` | Create a fresh upload SAS; create the artifact metadata record if needed. |
| `PUT <Azure SAS URL>` | Upload directly; planner may overwrite its own plan. |
| `PUT /api/artifacts/{id}` | Record the latest successful upload's size/hash/time. |
| `GET /api/artifacts` | Discover readable artifact metadata, without SAS URLs. |
| `GET /api/artifacts/{id}` | Inspect metadata for one permitted artifact, without SAS. |
| `GET /api/artifacts/{id}/sas` | Obtain a just-in-time read SAS for the current blob. |
| `GET <Azure SAS URL>` | Download directly from Azure. |

- Planner P1 writes a local file, requests an upload SAS for `plan`, uploads it and reports completion. It may repeat the write/report cycle using the same artifact ID and blob.
  - A later execution of P1 can continue editing it. A different planner step P2 does not inherit P1's write access.
- Coder C1 reads P1's current plan after P1 finishes producing it.
  - Assume one active writer per step and no overlapping executions. No artifact history, attempt logging, version selection or concurrent-writer coordination is required.
- [examples.json](./examples.json) contains checked sample requests/responses, including repeated writes and same-step retry behavior.
  - Descriptive example names are navigation labels, not artifact IDs. HTTP outcomes are separate fields.

## Trusted caller context

- Authentication and context construction are deferred. The initial service consumes the trusted field directly; it has no workflow-step lookup dependency. HMAC versus Kubernetes ServiceAccount authentication remains undecided. Tests inject fixed server-owned contexts; future trusted middleware must establish this field:

```ts
// Server context only; never populated from body, query or arbitrary headers.
event.context.caller = {
  runId,     // workflow instance
  stepId,    // caller's logical step; ownership boundary
  taskType,  // server-established work type, e.g. planner or coder
  inputs,    // exact readable candidates bound by trusted workflow code
  outputs,   // exact own-output candidates bound by trusted workflow code
}
// Internal artifact reference: { runId, producerStepId, name }
```

- IDs are canonical lowercase UUID v4; each binding array has at most 64 references.
  - References stay within the caller's run. Outputs belong to its own step. A step's retry receives the same artifact context; no attempt field is required or accepted by this contract.
- Missing/malformed context fails closed with 503 `CALLER_CONTEXT_UNAVAILABLE`. Unknown tasks receive no effective grants: resource requests are 404 and discovery is an empty list.
  - `readCallerContext` validates the trusted field. It never fills it from HTTP claims or performs authentication. Tests inject context directly, not via token fixtures.

## Authorization is code

- `deriveArtifactAccess` intersects task policy with trusted bindings, yielding readable, creatable and updatable reference sets.
  - De-duplicate references. Create/update requires the caller's own output and same run/step; read requires an exact bound input/output plus read capability.
- The selected POC map is planner `plan:create` + `plan:update`, coder `plan:read`; all other capabilities are denied.
  - Matching task types do not share ownership. Only planner own-plan writes are selected; create-only producers are deferred.
- POST uses `name` to select a permitted own-output slot; the service derives the full reference.
  - No caller-supplied producer ID, role, permission list, blob path or SAS lifetime is accepted.
- Determine visibility from the union of readable, creatable and updatable grants before ID lookup.
  - Repository lookups stay within that any-action scope. Missing/outside scope is 404; a found record with the wrong action is 403. List results still use readable scope only; no stored fields or SAS are returned on a permission error.
- Writes do not imply reads. POST/completion return small acknowledgments rather than stored rows.
  - A write-only planner receives no download URL or stored metadata. Policy/context unit tests run without an HTTP server; HTTP tests are separate.

## HTTP behavior

| Operation | Success | Key failures |
| --- | --- | --- |
| Create upload SAS | 201 new artifact; 200 same artifact and fresh SAS. Body: `id`, current `state`, `upload`. | 404 no access/missing step; 403 existing accessible artifact lacks create/update; 409 changed content type. |
| Complete upload | 200; only `id`, `state: uploaded`. | 404 no access/missing; 403 existing accessible artifact lacks the required create/update action. |
| List | 200; `{ artifacts: [...] }`, possibly empty. | Missing/malformed middleware context is 503. |
| Metadata | 200; reserved/uploaded information. | 404 no access/missing; 403 existing artifact has only write access. |
| Download SAS | 200; `url`, `method: GET`, `expiresAt`. | 404 no access/missing; 403 existing artifact has only write access; 409 never acknowledged. |

- POST accepts required `name`, `contentType` and optional `kind`, `title`, `description`.
  - One row/ID per producing step/name. The first POST establishes descriptive metadata; later POSTs ignore omitted or changed kind/title/description and return a fresh SAS for the same ID/blob. A different content type remains 409. No separate renewal protocol or previous-URL lookup exists.
- Completion accepts `state: uploaded`, `sizeBytes`, `sha256`, only after Azure upload success.
  - For the planner, each accepted report replaces size/hash and refreshes `uploadedAt` and `updatedAt` together using one DB timestamp, including an identical retry. It is the last acknowledgment time, not independently verified Azure upload time; no report history is stored.
- An unexpired planner upload SAS can be reused for multiple writes. Requesting another URL does not change state, metadata, `updatedAt`, ID or blob key. SAS URLs are never stored or logged.
  - Until another acknowledgment, metadata describes the last acknowledged upload. This POC relies on read-after-production ordering, not atomic coordination between Blob bytes and database metadata.
- Information includes `id`, `name`, `contentType`, `state`, `createdAt`, `updatedAt` and supplied kind/title/description.
  - Uploaded records also include latest reported size/hash/`uploadedAt`; reserved records omit those fields. Responses contain no producer identity, internal reference or SAS.
- `createdAt` is fixed at registration; `updatedAt` starts at the same instant and advances on every accepted upload acknowledgment.
  - Descriptive metadata is immutable in this slice. Reads, denied/failed operations and repeated POSTs leave timestamps unchanged. Write-only acknowledgments still omit stored timestamps/metadata.
- Discovery returns all existing readable records, reserved or uploaded, ordered by `createdAt`, then `id`, ascending.
  - At most 128 trusted bindings bound the result; no pagination or single-result assumption. Unregistered bindings do not create fake records. Metadata/discovery never calls the SAS issuer.
- A signing failure returns 503 while preserving the artifact for retry.
  - A planner can request another SAS, re-upload to the same blob and then report success. Issuing a URL or recording completion does not itself upload/verify bytes or revoke previous URLs.

## Detailed contract and checks

- [Implementation details](./implementation.md) define validation/errors, step-based persistence, SAS modes, ports and dependencies; [OpenAPI](./artifact.openapi.json) defines machine-readable shapes.
  - [Ports](./artifact-ports.ts) are compile-checked interfaces, not implementations. The latest rules do not require workflow endpoints or an attempts table.
- On Node 24: `npm ci`, `npm run check:artifact-contract`, `npm run check:guidance`, `npm run verify`, `git diff --check`.
  - Checks validate schemas, examples, seed relationships, stable example IDs and port types. They do not execute authorization or prove Azure/PostgreSQL behavior.

## Choice sources

| Choice | Source / status |
| --- | --- |
| Step ownership; same ID/blob across retries; planner repeat writes; latest completion only | Agreed with architect on 2026-10-26; supersedes attempt-specific identity and blanket create-only restrictions in issue #5. |
| No per-attempt logging/history; one active writer per step; consumers read after production | Agreed POC operating scope, not an enforced concurrency guarantee. |
| Different step cannot overwrite by default; same-step later execution may update under policy | Architect's explicit clarification; roles alone do not transfer ownership. |
| Resource paths, metadata/SAS separation, airport analogy and discovery | Architect's PR comments and interactive direction. |
| 404 for missing/no access; 403 only for an existing accessible artifact with wrong action; required `createdAt`/`updatedAt` | Architect's inline review comments; timestamp update mechanism is specified in the implementation contract. |
| Authentication upstream; define caller context only | Architect's explicit instruction; no token/resolver work in this slice. |
| Direct cloud bytes, PostgreSQL 17/Drizzle, metadata ownership | Original issue requirements retained; no deployed database assumed. |
| Step FK/export contract; exact blob key; 300-second SAS | **New concrete proposals**, consistent with the agreed step-owned model. |
| Context field name, limits, discovery order/bound, descriptive metadata immutability | **New proposals** absent from pinned plans; unchanged unless listed above as agreed. |
| Optional title/description fields and limits, adapter signatures and dependency versions | **New proposals** for PR review; caller-authored descriptive metadata was suggested by the architect. |
| Completion timestamp refresh on identical retries | **Concrete refinements** of latest-report storage; no deduplication IDs/history added. |

- [Architecture decisions](../architecture.md#decision-log) record the accepted refinements; the pinned plans remain references.
  - Review/merge settles the remaining proposals. Implementation requires no parent checkout, personal memory, conversation history or running agent.
