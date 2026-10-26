# Artifact contract proposal

> [!IMPORTANT]
> Issue #5 contract review proposal, not an implemented API. The pinned plans are reference material, not approval of their proposals. Merge/review of this PR is the decision point for the choices below. No database, Azure connection, caller authentication or product route is supplied here.

[OpenAPI](./artifact.openapi.json) is the HTTP shape source. [Examples](./examples.json) and [test-only assignments](./assignments.fixture.json) are executable schema fixtures. [Adapter ports](./artifact-ports.ts) specify module boundaries. The [artifact plan](../plans/artifact-service.md) describes the service; the [workflow plan](../plans/workflow-service.md) supplies background identity context.

## Choice provenance

Every row remains a proposal for this PR unless explicitly identified as an issue requirement. “New” means absent as a concrete choice in the pinned plans at `67c4f98d81c2a96d4f80c0bc8ecaf25a985ede6e`; it does not mean previously approved.

| Topic | Provenance | This PR's proposed end state and reason |
| --- | --- | --- |
| Three operations; bytes bypass API | Issue requirement; carried from plan | Create authorization, completion acknowledgment, read authorization. No content proxy or update operation. |
| Assignment/reference shapes and exact access | Issue requirement; carried from plan | Trusted assignment and exact four-field reference; caller cannot replace policy or ownership. |
| PostgreSQL 17 / Drizzle / metadata fields | Issue requirement; inherited schema proposal | Retain planned target, unique producer attempt/name and workflow-owned FK. No deployed DB assumed. |
| HTTP paths, methods, status/error/response shapes | **New** | Three POST operations below. JSON references avoid exposing SAS/credential material in API query strings. Closed response shapes protect write-only callers. |
| Identifier, name and metadata limits | **New** | Lowercase canonical UUID v4 for this slice, logical slug names, required content type, optional kind, required completion size/hash. Tight limits avoid path ambiguity and unsafe JS integer conversion. Does not settle UUIDs for the whole workflow service. |
| Repeated create and completion | **New** | Matching reserved create reissues access; incompatible create conflicts. Identical acknowledgment is idempotent; conflicting completion is rejected. Immutable bytes and metadata after completion. |
| Blob key, SAS lifetime and upload operation | **New** | Deterministic full-reference key; five-minute blob-scoped `c` or `r` SAS; single Put Blob for upload. No `w` grants. |
| Code policy vs. persisted grants | Existing alternatives; **new selection** | Trusted in-process assignment resolver plus code policy; no `artifact_grants` table for this slice. Keeps fixture path small without adding a second permission owner. |
| Task policy | Inherited illustrative proposal; **new selection of subset** | Only planner creates `plan`; only coder reads `plan`. Every other task/name/action denied. Remaining coding-loop map is background, not enabled policy. |
| Test identity and default-deny resolver | Fixture idea carried from plan; **new exact contract** | Explicit test injection of opaque token lookup; rejecting resolver otherwise. Production identity mechanism stays deferred. |
| Adapter signatures, workflow identity export and fixtures | **New** | Compile-checked ports and minimal workflow-owned schema/seed prerequisite below; no competing artifact-owned workflow tables. |
| Validation, tests, driver and SDK packages | **New** | Ajv, Node native tests, node-postgres, Azure SDK versions below; only contract-check tooling installed in this PR. |

## HTTP behavior

All three operations require service caller authentication. For test callers use `Authorization: Bearer <opaque-token>`. This is a test transport, not a choice of production HMAC or Kubernetes authentication. Default unresolved identity returns 401. A successfully resolved assignment with unknown task returns 403.

| Operation ID | Method and path | Request / success | Example IDs |
| --- | --- | --- | --- |
| `createUpload` | `POST /api/artifacts/upload-authorizations` | `CreateUploadRequest` / `CreateUploadResponse`, 201 new reservation or 200 matching reserved repeat | `createUpload-201`, `createUpload-200` |
| `acknowledgeUpload` | `POST /api/artifacts/upload-acknowledgments` | `AcknowledgeUploadRequest` / `AcknowledgeUploadResponse`, 200 first or identical repeat | `acknowledgeUpload-200` |
| `readDownload` | `POST /api/artifacts/read-authorizations` | `ReadDownloadRequest` / `ReadDownloadResponse`, 200 uploaded artifact | `readDownload-200` |

Accept only `application/json` (optional UTF-8 charset on the HTTP media type). Body limit 8 KiB: excess is 413; absent/invalid JSON is 400; other media types are 415. No query parameters are accepted. Objects are closed at every level: unknown fields, including assignments, permissions, roles, actions, storage keys and TTL overrides, are 400. Never coerce types, trim/normalize identifiers or silently strip input fields. Unsupported methods on these known paths return 405 with `Allow: POST` and the same error envelope. Routes do not redirect to Blob URLs.

Response field allowlists are the OpenAPI schemas. All responses have `Cache-Control: no-store`. Errors contain only `{ error: { code, message, fields? } }`; `fields` is used only for 400 validation failures, with at most 20 JSON-pointer paths and stable categories. Malformed JSON uses path `''` and code `format`; query errors use `/query`; missing body uses `''` and `required`. Values, credentials, stack traces, SQL details and SAS URLs never appear in errors. Message text is descriptive and not an enum. Status/code mappings in OpenAPI are normative. Domain result mapping is `unauthenticated` → 401, `forbidden` → 403, `not_found` → 404, `conflict` → 409, `unavailable` → 503, `internal_error` → 500; validation/media/method/body-size failures are HTTP-layer errors. Do not wrap this envelope in H3's default error serialization; future handlers need a deliberate error mapper.

Order: resolve caller; enforce media/body limit and parse/validate; authorize exact reference/action; validate producer identity linkage; metadata operation; URL issuance if needed. Authorization denial never invokes metadata lookup or URL issuance. Unknown/absent credentials are 401; a known but ungranted caller is 403 regardless of artifact existence. For an authorized reference only: missing producer identity or artifact/reservation is 404; a mismatched run/step/attempt relation is 403; wrong state or conflicting immutable metadata is 409. Sanitized dependency failures are 503, unexpected failures 500. Ingress-level size enforcement may precede identity resolution. The contract check validates shapes, not this runtime ordering.

Create and acknowledgment require `create` permission on the producer's own declared output. Acknowledgment is metadata completion, not a separate byte-update permission. Read requires `read` permission plus an exact input/output binding. Policy is the intersection of task capability, same-run membership and exact binding; output ownership also requires assignment step/attempt equality. Unknown tasks, unknown names, cross-run targets, other executions, other names and every `update` are denied. A role match alone grants nothing. The selected code map is `planner: ['artifact/plan:create']`, `coder: ['artifact/plan:read']`; all other entries are empty. No grant persistence is needed for this slice.

## Validation and metadata

- IDs: canonical lowercase UUID v4, including RFC variant bits, as the spec's regex requires. References have exactly `runId`, `producerStepId`, `producerAttemptId`, `name`. Client references select targets; ownership is validated against server-resolved assignment and workflow identity, never derived from a claimed role.
- Names: 1–64 lowercase ASCII characters matching `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`. Logical `plan`, not `plan.md`. No dots, slashes, empty segments, Unicode, percent decoding or normalization. `kind`, when present, uses the same syntax. Omitted kind is stored as SQL NULL; explicit JSON null is rejected.
- `contentType`: required at reservation, 3–127 characters, lowercase bare type/subtype matching the spec; no parameters. Immutable for that reference. This is caller-declared metadata, not content sniffing. `kind` is also caller-declared and immutable.
- `sizeBytes`: required integer at acknowledgment, 0–104857600 (100 MiB); `sha256`: required 64 lowercase hex characters, hash of the uploaded bytes. `uploadSucceeded` must be literal true. They are producer reports, not Azure-verified facts. The API cannot enforce the actual Blob size/hash from these fields; SAS does not impose this application size cap. Future real-Blob checks verify client behavior without claiming hostile-client size enforcement.
- Server-derived: UUID v4 artifact `id`; `producerAttemptId` from the verified own output; default `state=reserved`; `createdAt` from the DB; first `uploadedAt` from the DB clock. No caller timestamps, IDs, storage keys or states. `sizeBytes`, `sha256`, `uploadedAt` are NULL in reserved state and all non-NULL in uploaded state.
- Persistence: `artifacts` fields are `id`, `producerAttemptId`, `name`, `kind`, `contentType`, `state`, `sizeBytes`, `sha256`, `createdAt`, `uploadedAt`. Require content type NOT NULL. Unique `(producer_attempt_id, name)`; UUID PK and `producer_attempt_id -> step_attempts(id) ON DELETE RESTRICT`. Explicit SQL CHECKs enforce state, state-dependent nullability, name/kind/content-type patterns, size range and hash format; TypeScript enum hints alone are insufficient. No `updatedAt` or stored SAS/key column. Use UTC service sessions, `timestamptz` and UTC `Z` strings at adapter/API boundaries.

## State and retry rules

Reservation is atomic on `(producerAttemptId, name)`. A new row returns 201. An exact repeat (same content type and kind, including omitted kind) while reserved returns 200 with the same reservation and a fresh create-only URL. A mismatched kind/content type or any create after uploaded returns 409. Concurrent identical creates yield one 201 and matching 200s; no check-then-insert race. Compare all four reference fields against the workflow identity before relying on the two-column uniqueness key.

A signer failure returns 503 and leaves a valid reservation for retry. Reissuing a URL never resets state or permits overwrite. If upload succeeded but its response was lost, retrying Put Blob can fail because the blob already exists. The caller must not fabricate successful upload acknowledgment; it needs its own retained successful Azure response. Otherwise use a newly assigned producer execution through trusted workflow code. No byte probing/recovery endpoint is added here.

Acknowledgment requires an existing reservation and a producer report that Azure returned success (201 for the selected Put Blob). First acknowledgment atomically transitions reserved → uploaded, records size/hash and DB time, and returns only reference/state. Identical repeats return the same acknowledgment without changing timestamps; a different size/hash returns 409. Concurrent differing acknowledgments have one winner and one conflict. The server does not HEAD/download/hash the blob or store Azure response proofs. An acknowledgment can therefore be dishonest; “uploaded” records the producer's report, not independently verified content.

Read of a missing authorized target is 404; reserved is 409; uploaded returns declared content type, reported size/hash and fresh read-only URL. It does not return the database row, artifact UUID, timestamps or kind. Workflow code orders producer before consumer; no polling is required.

## Storage contract

Private runtime configuration keys are `artifactStorageAccountUrl` (HTTPS account endpoint, no default), `artifactStorageContainer` (default `artifacts`) and `databaseUrl` (no default). Never place these credentials/configuration under `runtimeConfig.public`; Azure identity credentials come from the server process credential chain. Real adapter construction fails closed with sanitized 503 if required configuration or identity is unavailable. Derived blob key, exactly:

```text
v1/runs/{runId}/steps/{producerStepId}/attempts/{producerAttemptId}/artifacts/{name}
```

Use validated canonical segments verbatim, with no filename suffix or caller prefix. Each authorization is a user delegation SAS for this single blob (`sr=b`, `spr=https`), issued at server time with expiration exactly 300 seconds later; no caller TTL. Omit SAS `startsOn` to avoid client clock skew; obtain a delegation key covering issuance through expiry. Do not issue a shortened/expired URL if key acquisition fails: return 503. URLs are transient bearer capabilities and are never persisted or logged.

Upload: only `sp=c`, method PUT, single **Put Blob** with `x-ms-blob-type: BlockBlob`, declared `Content-Type`, `If-None-Match: *`, and client-computed Content-Length. No multi-block upload SDK helpers that require `w`. Azure documents [create versus overwrite permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas): `c` permits new block blobs; overwrite requires `w`. The conditional header is client behavior; withholding `w` is the Azure permission mechanism that prevents overwrite even if a client omits that header. Acknowledgment does not expand the SAS. Read: only `sp=r`, method GET, same blob key. No list/delete/update permissions. Existing URLs remain usable until expiry; metadata completion does not revoke a URL.

The service holds its own Azure credential and obtains the delegation key. Callers receive only scoped URLs. Production workload identity and real account permissions are integration work. Local real-Azure verification will need an explicitly configured service development identity with delegation-key and blob data permissions; no credentials are included. See [user delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas) and [JavaScript SDK flow](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-create-user-delegation-sas-javascript). Example signatures are deliberately nonfunctional.

## Assignment resolution and workflow identity

[Fixture tokens](./assignments.fixture.json) are fixed opaque lookup keys, never parsed roles. Only tests/local harnesses explicitly injecting `createFixtureAssignmentResolver` may use them. Require `NODE_ENV=test` as an additional guard; reject fixture construction otherwise. The application default is `createRejectingAssignmentResolver`, returning `unauthenticated` for every caller. The future guard calls `ArtifactService.resolveCaller`, stores only its trusted result in typed `event.context`, and passes that assignment to service methods; it never builds an Assignment from HTTP fields. There is no environment flag that activates fixtures in a deployed app. Never load the JSON fixtures into production routes. Resolver output and all referenced identities are validated before use; malformed trusted configuration is a 503 dependency failure, not an opportunity to accept HTTP claims.

The planner P1 execution 1 in run A creates `plan`; coder C1 execution 1 in run A reads exactly that reference. [Negative policy fixtures](./examples.json) identify changed runs, producer steps/executions, names, action, same-task ownership and unknown tasks. Missing/unknown credentials are 401; those recognized ungranted assignments are 403. `update` is always false in the policy, and unsupported HTTP methods are 405. No broader workflow is selected by the fixture task names.

The workflow-owned identity prerequisite is a separate **minimal workflow slice**, not the full workflow service and not an artifact-owned stub in production. Its owner supplies the following schema/export contract in the shared planned `workflow` PostgreSQL database (public SQL schema):

| Table / export from future `server/db/workflow.schema.ts` | Required columns and constraints |
| --- | --- |
| `runs` / `runs` | `id uuid PRIMARY KEY` |
| `steps` / `steps` | `id uuid PRIMARY KEY`, `run_id uuid NOT NULL REFERENCES runs(id) ON DELETE RESTRICT` |
| `step_attempts` / `stepAttempts` | `id uuid PRIMARY KEY`, `step_id uuid NOT NULL REFERENCES steps(id) ON DELETE RESTRICT`, `attempt_number integer NOT NULL CHECK (attempt_number >= 1)`, UNIQUE `(step_id, attempt_number)` |

For this minimal slice, fixture “execution 1” is `attempt_number=1`; no Argo retry-number mapping is selected. These are minimum identity columns, not a redefinition of the whole workflow schema. Workflow-owned migrations precede artifact-owned migrations in one migration journal. Artifact schema imports `stepAttempts` from that module and preserves its FK; it never creates its own workflow table or drops the FK. A future expanded workflow migration must preserve the fixture seeding contract or supply an updated workflow-owned seed function.

Local database fixtures create a disposable PostgreSQL 17 database, apply that workflow-owned identity migration, seed run A and run B, steps P1/C1/P2 under A, and the three attempt UUIDs in the assignment fixture (P1/C1/P2 execution 1), then apply the artifact migration. Unknown-task caller is a negative resolver configuration reusing C1 identity, not another persisted task assignment. Workflow-owned test helper `seedArtifactWorkflowIdentities(client)` in future `tests/integration/fixtures/workflow-identities.ts` owns inserts and returns the fixed references. No artifact endpoint can create these identities. Cleanup removes artifacts before parent identities or drops the disposable database. Test the real FK, invalid producer insertion, uniqueness and RESTRICT deletion. No running workflow engine is required. No deployed database is assumed.

## Adapter ownership and semantics

[artifact-ports.ts](./artifact-ports.ts) is a compile-checked design artifact only. [artifact-schemas.ts](./artifact-schemas.ts) is generated from the dereferenced OpenAPI schemas; `json-schema-to-ts` derives HTTP types, avoiding handwritten duplicate payload interfaces. Neither file implements a service. Future implementation moves the shared schemas/types into `shared/utils/artifact-schemas/` and `shared/types/artifact.ts`; server ports into `server/utils/artifact/ports.ts`. Preserve these port export names and method signatures so independent adapters compile against a common owner. Concrete database/SDK factory construction is private composition wiring, not part of the common adapter port. No parallel independently defined ports.

| Future module / exports | Responsibility |
| --- | --- |
| `server/utils/artifact/assignment.utils.ts` / `createRejectingAssignmentResolver`, `createFixtureAssignmentResolver` | Resolver factories satisfying `AssignmentResolver`; production resolver later replaces rejecting implementation through explicit composition. |
| `server/utils/artifact/policy.utils.ts` / `canAccessArtifact` | Pure `(assignment, reference, action) => boolean`, selected task map and exact binding checks. |
| `server/db/workflow.schema.ts` / `runs`, `steps`, `stepAttempts` | Workflow owner supplies minimal identity schema and migrations. |
| `server/utils/artifact/workflow-identity.utils.ts` / `createWorkflowIdentityRepository` | Workflow owner adapter for existing attempt → step → run lookup. |
| `server/db/artifact.schema.ts` / `artifacts` | Artifact owner schema and migration; references workflow export. |
| `server/utils/artifact/metadata.utils.ts` / `createArtifactMetadataRepository` | Atomic reservation/completion and exact lookup; typed persistence result. |
| `server/utils/artifact/azure-url.utils.ts` / `createAzureArtifactUrlIssuer` | Deterministic key derivation and delegated SAS issuance; credentials stay server-side. |
| `server/utils/artifact/service.utils.ts` / `createArtifactService` | Expose `resolveCaller` before HTTP validation; compose policy, workflow identity, metadata and signer for validated requests; map domain errors to HTTP shapes. |

Ports return discriminated results for expected outcomes, not sentinel nulls or thrown H3 errors. Backend outages map to `unavailable`; unexpected exceptions are caught by the service boundary and sanitized as 500. Metadata methods assume prior authorization, still verify exact row identity through workflow linkage, and never issue URLs. Reservation comparison uses content type/kind only. Completion comparison uses size/hash only. Issuer receives a verified record and action; it cannot grant additional actions or accept a caller key/TTL. API response allowlists are constructed separately from internal records. `canAccessArtifact` is checked anew on every request; no cached permission from previous create.

## Dependency proposals and verification

Only four **development** packages are added now for contract checks: `@apidevtools/swagger-parser@13.1.0`, `ajv@8.20.0`, `ajv-formats@3.0.1`, `json-schema-to-ts@3.1.1`. Locked install and the checks below establish compatibility with this repository on Node 24 / TypeScript 6. `openapi-typescript@7.13.0` was not selected because its peer range requires TypeScript 5.

For subsequent implementation, the proposed package baseline is:

| Use | Proposed dependency / mechanism | Compatibility basis |
| --- | --- | --- |
| Runtime HTTP validation | `ajv@8.20.0`, `ajv-formats@3.0.1` promoted to runtime dependencies; the same closed JSON schemas | [Ajv JSON Schema](https://ajv.js.org/json-schema.html), no coercion/default insertion/removal. Generate shared schema constants from the contract, with fixture parity checks. |
| Type derivation | `json-schema-to-ts@3.1.1` dev dependency | [Schema inference](https://github.com/ThomasAribart/json-schema-to-ts); type-only use, tested by this PR's port compilation. |
| Unit / HTTP integration tests | Node 24 `node:test`, `node:assert/strict`, native fetch; no new runner dependency | [Native runner](https://nodejs.org/docs/latest-v24.x/api/test.html). First product issue adds `test` commands; launch built Nitro server on a disposable port for HTTP tests. Native TS tests use explicit relative `.ts` imports, not Nuxt aliases. |
| Explicit product typecheck | `vue-tsc@3.3.13` dev dependency and `nuxt typecheck` | This PR checks design ports only. Do not claim application typechecking exists. The package peer range is TypeScript >=5; install/verify it with the first product issue. |
| PostgreSQL metadata | `drizzle-orm@0.45.4`, `pg@8.23.1`; dev `drizzle-kit@0.31.11`, `@types/pg@8.23.1` | [Drizzle node-postgres](https://orm.drizzle.team/docs/get-started-postgresql). One lazily initialized `pg.Pool` per Nitro process, `max=5`, UTC session initialization, closed on Nitro shutdown; private database URL; disposable PostgreSQL 17 for integration tests. |
| Azure SAS | `@azure/storage-blob@12.34.0`, `@azure/identity@4.14.0` | [SDK flow](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-create-user-delegation-sas-javascript); package engines require Node >=22, covered by Node 24. |

Database/Azure packages above are proposals verified against current package metadata and primary API docs, not installed or integration-tested here. Subsequent tickets must lock them and prove adapter behavior. No Azure or PostgreSQL integration is claimed by the contract check.

```sh
npm ci
npm run check:artifact-contract
npm run check:guidance
npm run verify
git diff --check
```

`check:artifact-contract` validates OpenAPI structure/references with Swagger Parser (schema validation, not a complete semantic OpenAPI linter), compiles every component schema with Ajv and formats, checks every inline request/response example, validates positive/negative fixtures and policy-case shapes, verifies generated schemas are current, and typechecks the adapter ports. It makes no network calls and uses no credentials. `npm run generate:artifact-schemas` deliberately refreshes the generated schema constants after contract edits. `verify` includes the contract check so CI protects it.

Later behavioral tests must execute all policy denials with signer/metadata spies, unresolved identity, all state/retry/concurrency cases, precise response allowlists, malformed input and error mapping. Real PostgreSQL tests prove FK/uniqueness/atomicity/restart durability. Real Azure tests prove direct five-byte `plan\n` handoff, read-only permissions, create-only overwrite denial even without the conditional header, and byte/hash equality. Mock URLs and builds establish none of those integrations.
