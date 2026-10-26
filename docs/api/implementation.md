# Artifact implementation contract

- Read the [airport model and API overview](./README.md) first.
  - These merged specifications define the contract. The [foundation handoff](./foundation.md) identifies implemented utilities and exports; service/routes and real adapters remain pending. Choice provenance is recorded in the overview.

## Validation and errors

- POST/PUT accept only `application/json`, optionally with UTF-8 charset, with an 8 KiB body limit.
  - Invalid/absent JSON is 400; oversized bodies 413; other media types 415. GET accepts no body. No query parameters are accepted.
- Request/response objects are closed at every level; do not coerce types, trim names or strip unknown fields.
  - Caller context, roles, permissions, producer IDs, storage paths and TTL overrides in HTTP input are rejected. The ID path parameter is validated, then looked up inside the union of effective read/create/update scopes.
- All responses use `Cache-Control: no-store`.
  - Unsupported methods return 405 with `Allow: GET, POST` on the collection, `Allow: GET, PUT` on an artifact, or `Allow: GET` on its SAS subresource. There are no redirects to cloud URLs.
- Errors use `{ error: { code, message, fields? } }` as specified in OpenAPI.
  - Only 400 carries `fields`: 1–20 JSON-pointer paths and categories. Missing body uses path `''`/`required`; malformed JSON uses `''`/`format`; forbidden query fields use `/query`/`unknown_field`. No input values, credentials, SAS URLs, SQL details or stack traces are returned.
- Result mapping is `forbidden` → 403, `not_found` → 404, `conflict` → 409, `unavailable` → 503 and `internal_error` → 500.
  - Missing/invalid middleware context specifically maps to 503 `CALLER_CONTEXT_UNAVAILABLE`; other unavailable dependencies use `DEPENDENCY_UNAVAILABLE`. Authentication responses belong to upstream middleware, outside this contract.
- Trusted caller context is an input to the artifact service. Validate its shape, same-run bindings and own-step outputs, then apply resource policy; do not resolve the caller through workflow persistence. Future authentication integration must establish this context server-side. Missing/malformed context stays 503 `CALLER_CONTEXT_UNAVAILABLE`; body, query and arbitrary header claims cannot replace it.
- Handler order is context validation → HTTP validation → derive any-action visibility → scoped existence lookup → requested-action check → operation/SAS issuance.
  - Ingress size limits can run earlier. Future handlers need deliberate error shaping rather than H3's default error envelope.

### 404 versus 403

- Default to 404 when the artifact is missing or outside the caller's any-action scope, regardless of whether a row exists elsewhere.
  - Use the same `ARTIFACT_NOT_FOUND` response for both. Empty effective scope needs no metadata query. Unknown tasks yield empty scopes rather than an unconditional 403.
- Return 403 only after finding an existing artifact inside that scope and determining that the requested action is not permitted.
  - A planner with write access to an existing plan gets 403 on metadata/download reads; a coder with read access gets 403 when completing/writing it. Return no artifact fields with the error. A readable but never-acknowledged artifact returns 409 for a download SAS, after permission succeeds.
- Discovery queries only readable scope and returns 200 with an empty list if none exists.
  - It neither returns write-only records nor fails the whole collection with 403. Having a raw binding without an effective policy capability grants no visibility.
- Registration targets the caller's own step/name, derived server-side; an input with the same name is a different target.
  - If that target is outside any-action scope, return 404 without lookup. If visible, use `findReferenceWithinScope` before deciding permission: missing + create grant allows insertion; missing without create is 404; existing + missing required action is 403. Reserved upload renewal requires create, uploaded renewal requires create/update capability. Only permitted requests reach metadata comparison/registration or signing.
- Completion first looks up the ID within any-action scope, then checks own-output create/update permissions.
  - Read-only access produces 403 for an existing artifact, not 404. A changed completion without update permission is also 403; a metadata mismatch on an otherwise permitted registration remains 409.

| Field | Validation / ownership |
| --- | --- |
| IDs | Lowercase UUID v4, RFC variant; generated/verified server-side. |
| `name`, optional `kind` | 1–64 lowercase ASCII slug characters; spec regex disallows dots, slashes, Unicode and empty segments. Logical `plan`, not a filename. |
| `contentType` | Required bare lowercase type/subtype, 3–127 characters; no parameters. Caller-declared, not content sniffing. |
| Optional `title` | 1–160 characters, one line; caller-authored text, never an authorization input. |
| Optional `description` | 1–2000 characters; caller-authored text, never an authorization input. |
| `sizeBytes` | Required completion integer, 0–104857600 (100 MiB); producer report. |
| `sha256` | Required completion value, 64 lowercase hex characters; producer report. |

## Persistence and workflow ownership

- Planned target: PostgreSQL 17 + Drizzle in the shared `workflow` database; no deployed database is assumed.
  - Fields: `id`, `producerStepId`, `name`, `kind`, `title`, `description`, `contentType`, `state`, `sizeBytes`, `sha256`, `createdAt`, `updatedAt`, `uploadedAt`. No attempt, revision, SAS or blob-key column/table.
- Require UUID PK, unique `(producer_step_id, name)` and `producer_step_id -> steps(id) ON DELETE RESTRICT`.
  - This step FK replaces the original issue's withdrawn attempt FK. The metadata adapter joins the workflow-owned step to validate run membership as persistence integrity, independently of caller authentication; the same step/name always selects one current artifact.
- `contentType` is NOT NULL; omitted kind/title/description become SQL NULL and are omitted from public responses.
  - Explicit JSON null is rejected. Registration metadata stays immutable; only completion fields/state change in this slice.
- Reserved means size/hash/uploaded time are NULL; uploaded means all three are present.
  - Use explicit SQL CHECKs for state/nullability, field patterns/lengths and size/hash limits. TypeScript enum hints do not enforce database constraints.
- Require `created_at` and `updated_at` as NOT NULL `timestamptz`, both defaulting to PostgreSQL `CURRENT_TIMESTAMP` at registration.
  - They start at the same instant. Keep `createdAt` fixed. On each accepted acknowledgment explicitly set `updated_at = CURRENT_TIMESTAMP` and `uploaded_at = CURRENT_TIMESTAMP` in the same SQL UPDATE as size/hash/state. Both use one [DB transaction timestamp](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT), including identical report retries; UTC sessions/serialization yield `Z` strings.
- SAS renewal matches the existing row without changing it; reads, failures and denied requests do not update timestamps.
  - Do not attach an automatic ORM on-update hook or blanket trigger that would make a no-op registration/URL refresh advance `updatedAt`. No general metadata editing exists yet. Do not append history or introduce upload/attempt version numbers.
- Workflow owns only the run/step identity prerequisite below for this slice; artifact code imports its `steps` export.
  - Full workflow endpoints, execution tracking and an attempts table are not required. Artifact code must not create a competing owner of workflow identities.

| Future `server/db/workflow.schema.ts` export | Minimum table contract |
| --- | --- |
| `runs` | `runs(id uuid PRIMARY KEY)` |
| `steps` | `steps(id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE RESTRICT)` |

- Apply workflow-owned identity migrations before artifact migrations in one journal.
  - Seed the exact runs/steps in [caller-contexts.fixture.json](./caller-contexts.fixture.json) using future workflow-owned `seedArtifactWorkflowIdentities(client)` in `tests/integration/fixtures/workflow-identities.ts`. `planner-p1-later-execution` deliberately has the same context as P1: it is not another identity row.
- Local PostgreSQL 17 tests must prove the real step FK, run membership, unique step/name, stable IDs, latest-report replacement, initial timestamp equality, acknowledgment updates and unchanged timestamps on renewal/denial, plus restart durability.
  - Test data also names artifact IDs/references. Remove child artifacts first during cleanup or drop the disposable database. No concurrent-writer/attempt-history tests or locking protocol are required under the agreed operating assumption.

## Repeat-write semantics

- `register(reference, metadata)` atomically inserts or returns the row for that step/name; it never creates a row for a retry.
  - A different registration content type/kind/title/description is 409. `createdAt` and artifact ID remain fixed. Only the URL expiry changes on renewal; existing upload state and completion metadata remain intact.
- The service chooses upload mode from trusted policy, not from HTTP input.
  - Create + update capability on the own output selects `create-or-update`, even for a newly registered artifact. Create without update selects `create-only` and may obtain renewal only while reserved; an already uploaded artifact returns 403 before signing because it exists within scope but update permission is absent.
- First completion requires create permission within the caller's own-output scope.
  - Later changed size/hash requires update permission in that same scope. For the planner this replaces the latest values, not a new artifact. Missing update permission for a changed report is 403. An identical retry is accepted, including for create-only callers, and refreshes `uploadedAt` and `updatedAt` together.
- `uploadedAt` and `updatedAt` are the service's last accepted-report time, not an audit log or an independently verified Azure timestamp.
  - The service does not HEAD/download/hash Blob content. A report can be dishonest, and SAS does not enforce the API's reported size cap on actual bytes.
- Assume one active writer per step, no overlapping executions, and consumption after production.
  - No leases, locks, ETags, revision IDs or compare-and-swap protocol are added. Previously issued URLs remain usable until expiry; neither metadata nor SAS issuance coordinates a read/write snapshot. Metadata can lag changed bytes until the next report.

## SAS and storage

- Private runtime config: `artifactStorageAccountUrl` (required HTTPS endpoint), `artifactStorageContainer` (default `artifacts`), `databaseUrl` (required).
  - Credentials stay in the service process credential chain. Missing configuration/identity yields sanitized 503; nothing belongs in `runtimeConfig.public`.
- Derive one blob key from the server-selected step reference, reused for all uploads:

```text
v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}
```

- Use validated segments verbatim; no filename suffix, attempt segment, caller prefix or key override.
  - Public metadata uses the artifact ID. Do not create snapshots, version-named blobs or per-upload keys.
- POC storage should have automatic Blob versioning disabled if no retained cloud revisions are desired.
  - Azure [creates retained versions on writes when versioning is enabled](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview). This contract does not provision or change a storage account; the real-storage test must check its configuration rather than claim one key alone prevents cloud history.
- Every URL is a single-blob user delegation SAS (`sr=b`, `spr=https`), expiring 300 seconds after issuance; omit `startsOn` to avoid client-clock skew.
  - A delegation key must cover the full lifetime; otherwise return 503. URLs are transient bearer capabilities: never persist or log them. Unexpired planner upload URLs can be reused; repeated POST renews them for the same ID/key.

| Mode | SAS / direct upload instructions |
| --- | --- |
| `create-or-update` | `sp=w`; PUT a BlockBlob; Content-Type + client-computed Content-Length; no `If-None-Match: *`. Creates or overwrites the same blob. |
| `create-only` | `sp=c`; PUT a BlockBlob with the same headers plus `If-None-Match: *`. Omitting `w` prevents overwrite even if a caller drops the conditional header. |
| Read | `sp=r`; GET the current blob, issued only by the explicit SAS read operation. No write/list/delete permission. |

- Azure documents [create versus overwrite permissions for Put Blob](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas).
  - Both upload modes use a single Put Blob with `x-ms-blob-type: BlockBlob`. Do not add multi-block upload flows or broaden create-only SAS to `w` as a convenience.
- Real verification requires separately supplied service identity/account permissions.
  - See [delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas) and [JavaScript SDK flow](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-create-user-delegation-sas-javascript). Example signatures are deliberately nonfunctional.

## Code boundaries

- Handwritten Zod domain schemas under `shared/utils/zod-schemas/` are the source of truth; payload/context types in `shared/types/artifact.ts` use `z.infer`. Runtime callers import a domain schema and use `safeParse`. All objects are strict; no coercion/defaults/transforms or unknown-field stripping.
  - `scripts/artifact-openapi.ts` owns handwritten HTTP metadata; `npm run generate:artifact-openapi` combines it with Zod's built-in OpenAPI 3.0 schema export to produce [OpenAPI](./artifact.openapi.json). Do not hand edit generated JSON. See the [workflow and runtime example](./foundation.md#schema-workflow).
- [artifact-ports.ts](./artifact-ports.ts) re-exports the compile-checked production interfaces from `server/utils/artifact/ports.ts`; the schema migration preserves their shapes. Caller context is supplied directly; no workflow-step lookup dependency is required.
  - Preserve the exported interfaces/method signatures so adapters compile against a common contract. Concrete database/SDK construction is private composition wiring.

| Module / exports | Status | Responsibility |
| --- | --- | --- |
| `server/utils/artifact/context.utils.ts` / `readCallerContext` | Implemented | Validate `event.context.caller`; no authentication. |
| `server/utils/artifact/policy.utils.ts` / `canAccessArtifact`, `deriveArtifactAccess` | Implemented | Pure policy and exact trusted binding intersection; no server needed for unit tests. |
| `server/db/workflow.schema.ts` / `runs`, `steps` | Planned | Workflow-owned run/step schema and migrations. |
| `server/db/artifact.schema.ts` / `artifacts` | Planned | Artifact metadata and FK migration. |
| `server/utils/artifact/metadata.utils.ts` / `createArtifactMetadataRepository` | Planned | Stable registration, explicit timestamps; any-action-scoped lookups, read-scoped lists. |
| `server/utils/artifact/azure-url.utils.ts` / `createAzureArtifactUrlIssuer` | Planned | Blob-key derivation and SAS issuance; no artifact access decision. |
| `server/utils/artifact/service.utils.ts` / `createArtifactService` | Planned | Apply trusted caller scope and compose metadata and signer. |

- Planned rows describe future modules; those files do not exist yet. The initial artifact service consumes complete trusted caller context and has no step-lookup interface, factory or dependency. Authentication and context construction remain deferred; HMAC versus Kubernetes ServiceAccount authentication is undecided. Tests inject fixed server-owned context directly.
- Ports return discriminated results for expected failures; no thrown H3 errors in adapters.
  - The service catches unexpected exceptions and maps them to sanitized 500. Response serializers select public fields explicitly; they do not return repository records.
- Metadata ports receive server-derived scope/reference, not caller-supplied permissions.
  - Recheck scope on every request. No cached permission from a previous registration or a known artifact ID.

## Dependency baseline and checks

| Use | Baseline |
| --- | --- |
| Generated-contract checks (dev only) | `@apidevtools/swagger-parser@13.1.0`, `ajv@8.20.0`, `ajv-formats@3.0.1` |
| Runtime validation and schema export | `zod@4.6.7`; handwritten strict domain schemas; inferred payload types; built-in OpenAPI 3.0 schema export |
| Unit / HTTP tests | Node 24 `node:test`, `node:assert/strict`, native fetch; pure policy/context tests first, HTTP tests against built Nitro on a disposable port. |
| Product typecheck | Dev `vue-tsc@3.3.13`, `nuxt typecheck`, plus standalone test/support TypeScript; installed and configured. |
| Persistence | `drizzle-orm@0.45.4`, `pg@8.23.1`; dev `drizzle-kit@0.31.11`, `@types/pg@8.23.1` |
| Azure SAS | `@azure/storage-blob@12.34.0`, `@azure/identity@4.14.0` |

- The foundation installs this dependency baseline, including runtime Zod and the future PostgreSQL/Azure adapter packages.
  - Installed packages are not evidence of a configured database, credentials or integration behavior. Node 24 meets Azure's Node >=22 engines; vue-tsc declares TypeScript >=5 compatibility.
- Use one lazy `pg.Pool` per Nitro process, `max=5`, UTC session initialization and shutdown cleanup.
  - Database tests need disposable PostgreSQL 17. Native TS unit tests use explicit relative `.ts` imports rather than unresolved Nuxt aliases.
- Primary references: [Zod schemas](https://zod.dev/api), [JSON Schema export](https://zod.dev/json-schema), [Node tests](https://nodejs.org/docs/latest-v24.x/api/test.html), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql).
  - Contract validation is evidence of schema/example consistency, not evidence of runtime authorization, persistence or Blob handoff.

```sh
npm ci
npm run check:artifact-contract
npm run check:guidance
npm run verify
git diff --check
```

- `check:artifact-contract` validates OpenAPI structure with Swagger Parser, compiles schemas with Ajv/formats, checks supplied examples/context-seed relationships, rejects missing/malformed context examples and typechecks the ports.
  - It checks negative example rejection and generated OpenAPI freshness. It does not execute authorization or contact Azure/PostgreSQL; Swagger Parser is not a complete semantic OpenAPI linter.
- `verify` includes contract checks, offline unit tests and application/test typechecking; `generate:artifact-openapi` refreshes generated OpenAPI after Zod schema or TypeScript HTTP definition edits.
  - Later tests must execute visibility/action distinctions, timestamp and repeat-write cases, prove metadata discovery does not call the signer, and prove scope omissions return no foreign records.
- Real Azure tests must upload UTF-8 text containing `plan` followed by one LF newline, acknowledge it, overwrite the same blob with `revised plan` followed by one LF newline, acknowledge again and read the latest bytes/hash via a separate SAS.
  - Prove stable ID/key, planner overwrite success, create-only overwrite denial even without its conditional header, and read-only permission boundaries. A fake URL or successful build proves none of this.
