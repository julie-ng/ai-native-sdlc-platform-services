# Artifact service contract

> [!IMPORTANT]
> Contract/documentation PR only; no routes, database or Azure integration are implemented. The architect's agreed POC rules supersede the original attempt-specific/create-only scope. Remaining new choices are labeled under [choice sources](#choice-sources).

- [Ontology](../plans/artifact-service.md#ontology) defines run, step, attempt, artifact, producer, consumer and caller.
  - The step owns the artifact. An agent execution writes it; retries do not create a different artifact.

## The airport model

- Middleware has checked the caller's passport and supplies its trusted itinerary in `event.context.caller`.
  - The service already knows which artifacts the caller can read, create or update. A claimed role or matching filename grants nothing.
- A caller can ask, “What artifacts are available to me?”
  - Discovery returns zero, one or several readable artifacts; the caller need not know their IDs first.
- An artifact ID selects an item within that access list, like a baggage tag rather than a passport.
  - Foreign and nonexistent IDs receive the same 404. Knowing an ID never grants access.
- A SAS URL is the temporary ticket to the actual file in cloud storage.
  - Metadata reads do not issue that ticket. Obtain a download SAS only when needed.

## Caller experience

| Request | Result |
| --- | --- |
| `POST /api/artifacts` | Register a local file, or obtain fresh upload SAS for the same artifact. |
| `PUT <Azure SAS URL>` | Upload directly; planner may overwrite its own plan. |
| `PUT /api/artifacts/{id}` | Record the latest successful upload's size/hash/time. |
| `GET /api/artifacts` | Discover readable artifact metadata, without SAS URLs. |
| `GET /api/artifacts/{id}` | Inspect metadata for one permitted artifact, without SAS. |
| `GET /api/artifacts/{id}/sas` | Obtain a just-in-time read SAS for the current blob. |
| `GET <Azure SAS URL>` | Download directly from Azure. |

- Planner P1 writes a local file, registers `plan`, uploads it and reports completion. It may repeat the write/report cycle using the same artifact ID and blob.
  - A later execution of P1 can continue editing it. A different planner step P2 does not inherit P1's write access.
- Coder C1 reads P1's current plan after P1 finishes producing it.
  - Assume one active writer per step and no overlapping executions. No artifact history, attempt logging, version selection or concurrent-writer coordination is required.
- [examples.json](./examples.json) contains checked sample requests/responses, including repeated writes and same-step retry behavior.
  - Descriptive example names are navigation labels, not artifact IDs. HTTP outcomes are separate fields.

## Trusted caller context

- Authentication is outside this task. Define the trusted field that existing middleware must supply:

```ts
// Server context only; never populated from the HTTP body or query.
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
- Missing/malformed context fails closed with 503 `CALLER_CONTEXT_UNAVAILABLE`; unknown tasks return 403.
  - `readCallerContext` validates the trusted field. It never fills it from HTTP claims or performs authentication. Tests inject context directly, not via token fixtures.

## Authorization is code

- `deriveArtifactAccess` intersects task policy with trusted bindings, yielding readable, creatable and updatable reference sets.
  - De-duplicate references. Create/update requires the caller's own output and same run/step; read requires an exact bound input/output plus read capability.
- The selected POC map is planner `plan:create` + `plan:update`, coder `plan:read`; all other capabilities are denied.
  - Matching task types do not share ownership. The two upload modes also support a future explicitly configured create-only task without granting it overwrite rights; no additional task policy is selected here.
- Registration uses `name` to select a permitted own-output slot; the service derives the full reference.
  - No caller-supplied producer ID, role, permission list, blob path or SAS lifetime is accepted.
- ID lookup and completion query only within the relevant trusted scope.
  - Repository ports expose no unrestricted ID lookup. A different step's artifact is outside scope, even if the caller is also a planner.
- Writes do not imply reads. Registration/completion return small acknowledgments rather than stored rows.
  - A write-only planner receives no download URL or stored metadata. Policy/context unit tests run without an HTTP server; HTTP tests are separate.

## HTTP behavior

| Operation | Success | Key failures |
| --- | --- | --- |
| Register / renew upload SAS | 201 new artifact; 200 same artifact and fresh SAS. Body: `id`, current `state`, `upload`. | 403 ungranted output; 404 missing step identity; 409 changed registration metadata or create-only artifact already uploaded. |
| Complete upload | 200; only `id`, `state: uploaded`. | 404 outside own scope/missing; 409 changed completion without update capability. |
| List | 200; `{ artifacts: [...] }`, possibly empty. | 403 unknown task. |
| Metadata | 200; reserved/uploaded information. | 404 outside readable scope/missing. |
| Download SAS | 200; `url`, `method: GET`, `expiresAt`. | 404 outside readable scope/missing; 409 never acknowledged. |

- Registration accepts required `name`, `contentType` and optional `kind`, `title`, `description`.
  - One row/ID per producing step/name. Repeat the same descriptive metadata to renew SAS; changing those fields is outside this slice and returns 409. After upload, the planner still receives the same ID and a write-capable SAS.
- Completion accepts `state: uploaded`, `sizeBytes`, `sha256`, only after Azure upload success.
  - For the planner, each accepted report replaces size/hash and refreshes `uploadedAt` using server time, including an identical retry. It is the last acknowledgment time, not independently verified Azure upload time; no report history is stored.
- An unexpired planner upload SAS can be reused for multiple writes. Refreshing it does not reset state, completion metadata, ID or blob key.
  - Until another acknowledgment, metadata describes the last acknowledged upload. This POC relies on read-after-production ordering, not atomic coordination between Blob bytes and database metadata.
- Information includes `id`, `name`, `contentType`, `state`, `createdAt` and supplied kind/title/description.
  - Uploaded records also include latest reported size/hash/`uploadedAt`; reserved records omit those fields. Responses contain no producer identity, internal reference or SAS.
- Discovery returns all existing readable records, reserved or uploaded, ordered by `createdAt`, then `id`, ascending.
  - At most 128 trusted bindings bound the result; no pagination or single-result assumption. Unregistered bindings do not create fake records. Metadata/discovery never calls the SAS issuer.
- A signing failure returns 503 while preserving the artifact for retry.
  - A planner can renew its SAS, re-upload to the same blob and then report success. Issuing a URL or recording completion does not itself upload/verify bytes or revoke previous URLs.

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
| Resource paths, metadata/SAS separation, inaccessible ID → 404, airport analogy and discovery | Architect's PR comments and interactive direction. |
| Authentication upstream; define caller context only | Architect's explicit instruction; no token/resolver work in this slice. |
| Direct cloud bytes, PostgreSQL 17/Drizzle, metadata ownership | Original issue requirements retained; no deployed database assumed. |
| Step FK/export contract; exact blob key; 300-second SAS; two SAS modes | **New concrete proposals**, consistent with the agreed step-owned model. |
| Context field name, limits, discovery order/bound, descriptive metadata immutability | **New proposals** absent from pinned plans; unchanged unless listed above as agreed. |
| Optional title/description fields and limits, adapter signatures and dependency versions | **New proposals** for PR review; caller-authored descriptive metadata was suggested by the architect. |
| Completion timestamp refresh on identical retries; create-only repeat rules | **Concrete refinements** of latest-report storage; no deduplication IDs/history added. |

- [Architecture decisions](../architecture.md#decision-log) record the accepted refinements; the pinned plans remain references.
  - Review/merge settles the remaining proposals. Implementation requires no parent checkout, personal memory, conversation history or running agent.
