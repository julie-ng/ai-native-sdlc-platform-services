# Artifact implementation contract

- Read the [airport model and API overview](./README.md) first.
  - These are detailed proposals for implementing that contract, not an implemented service. Choice provenance is recorded in the overview.

## Validation and errors

- POST/PUT accept only `application/json`, optionally with UTF-8 charset, with an 8 KiB body limit.
  - Invalid/absent JSON is 400; oversized bodies 413; other media types 415. GET accepts no body. No query parameters are accepted.
- Request/response objects are closed at every level; do not coerce types, trim names or strip unknown fields.
  - Caller context, roles, permissions, producer IDs, storage paths and TTL overrides in HTTP input are rejected. The ID path parameter is validated, then used only inside a trusted access scope.
- All responses use `Cache-Control: no-store`.
  - Unsupported methods return 405 with `Allow: GET, POST` on the collection, `Allow: GET, PUT` on an artifact, or `Allow: GET` on its SAS subresource. There are no redirects to cloud URLs.
- Errors use `{ error: { code, message, fields? } }` as specified in OpenAPI.
  - Only 400 carries `fields`: 1–20 JSON-pointer paths and categories. Missing body uses path `''`/`required`; malformed JSON uses `''`/`format`; forbidden query fields use `/query`/`unknown_field`. No input values, credentials, SAS URLs, SQL details or stack traces are returned.
- Result mapping is `forbidden` → 403, `not_found` → 404, `conflict` → 409, `unavailable` → 503 and `internal_error` → 500.
  - Missing/invalid middleware context specifically maps to 503 `CALLER_CONTEXT_UNAVAILABLE`; other unavailable dependencies use `DEPENDENCY_UNAVAILABLE`. Authentication responses belong to upstream middleware, outside this contract.
- Handler order is context validation → HTTP validation → derive access → scoped metadata operation → SAS issuance if requested.
  - Ingress size limits can run earlier. Future handlers need deliberate error shaping rather than H3's default error envelope.

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

- Planned target: PostgreSQL 17, Drizzle, shared `workflow` database; no deployed database is assumed.
  - Artifact fields: `id`, `producerAttemptId`, `name`, `kind`, **new proposed** `title`/`description`, `contentType`, `state`, `sizeBytes`, `sha256`, `createdAt`, `uploadedAt`.
- Require a UUID PK, unique `(producer_attempt_id, name)` and `producer_attempt_id -> step_attempts(id) ON DELETE RESTRICT`.
  - `contentType` is NOT NULL. Omitted kind/title/description become SQL NULL and are omitted from public responses; explicit JSON null is rejected. Registration metadata is immutable, including title/description.
- Reserved rows have NULL size/hash/uploaded time; uploaded rows have all three values.
  - Explicit SQL CHECKs enforce state/nullability, name/kind/content-type syntax, text lengths, size and hash limits. Drizzle enum hints alone do not enforce database checks.
- Server clocks own `createdAt` and first `uploadedAt`; use `timestamptz`, UTC sessions and UTC `Z` strings at ports/API boundaries.
  - No `updatedAt`, stored SAS or blob-key column is added. Completion is a producer report; the service does not HEAD/download/hash Azure content. It does not independently verify the reported size or impose a size cap on the actual Blob through SAS.
- Workflow owns the minimal identity schema below and its migrations; artifact code imports its `stepAttempts` export.
  - No artifact-owned competing workflow table, removed FK or full workflow endpoint implementation is needed.

| Future `server/db/workflow.schema.ts` export | Minimum table contract |
| --- | --- |
| `runs` | `runs(id uuid PRIMARY KEY)` |
| `steps` | `steps(id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE RESTRICT)` |
| `stepAttempts` | `step_attempts(id uuid PRIMARY KEY, step_id uuid NOT NULL REFERENCES steps(id) ON DELETE RESTRICT, attempt_number integer NOT NULL CHECK (attempt_number >= 1))`, UNIQUE `(step_id, attempt_number)` |

- Workflow migrations precede artifact migrations in one journal; artifact persistence must retain the real FK.
  - These are minimum identity columns, not adoption of the broad workflow schema. Workflow extensions must preserve the seed contract or provide its updated seed helper.
- Local tests use a disposable PostgreSQL 17 database and workflow-owned `seedArtifactWorkflowIdentities(client)` in future `tests/integration/fixtures/workflow-identities.ts`.
  - Seed the exact runs/steps/executions in [caller-contexts.fixture.json](./caller-contexts.fixture.json). That file also names artifact IDs/references for later tests; its context names are sample labels, not credentials. `coder-no-inputs` and `unknown-task` are standalone context variants for tests, not alternate production grants.
- Seed execution numbers are one-based; no Argo retry-number mapping is selected.
  - Tests must prove FK insertion rejection, unique producer/name, RESTRICT deletion, concurrent reservation/completion and restart durability. Cleanup removes child artifacts first or drops the disposable database.

## SAS and storage

- Private runtime config: `artifactStorageAccountUrl` (HTTPS endpoint, required), `artifactStorageContainer` (default `artifacts`), `databaseUrl` (required).
  - Azure credentials stay in the service process credential chain. Missing configuration/identity fails closed with sanitized 503; nothing is placed in `runtimeConfig.public`.
- Derive the blob key from the **server-selected** output reference:

```text
v1/runs/{runId}/steps/{producerStepId}/attempts/{producerAttemptId}/artifacts/{name}
```

- Use validated segments verbatim; no caller prefix, filename extension or storage-key override.
  - The Azure adapter owns this convention. Public artifact metadata identifies the artifact by ID, not by its cloud path.
- Issue single-blob user delegation SAS, HTTPS only, expiring 300 seconds after issuance; omit `startsOn` to avoid client-clock skew.
  - The delegation key must cover issuance through expiry. Failure is 503, not an expired/shortened URL. SAS URLs are transient bearer capabilities: never persist or log them.
- Upload uses `sp=c`, single Put Blob, `x-ms-blob-type: BlockBlob`, declared Content-Type, `If-None-Match: *` and client-computed Content-Length.
  - Azure [requires `w` for overwrite](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas). Withholding `w` is the permission mechanism preventing overwrite even if a caller omits the conditional header. Do not use multi-block helpers requiring write permission.
- Download uses `sp=r` and GET for the same single blob, issued only by the explicit SAS read operation.
  - No list/delete/update permission is issued. Completion does not revoke earlier SAS URLs or expand their permissions.
- Real Azure verification requires separately supplied service identity/account permissions.
  - See [user delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas) and [JavaScript SDK flow](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-create-user-delegation-sas-javascript). Example signatures are deliberately nonfunctional.

## Code boundaries

- [artifact-ports.ts](./artifact-ports.ts) contains compile-checked design interfaces, not implementations.
  - [artifact-schemas.ts](./artifact-schemas.ts) is generated from OpenAPI; `json-schema-to-ts` derives payload/context types. Keep one schema source rather than handwritten duplicate payload interfaces.
- Future shared ownership: `shared/utils/artifact-schemas/` and `shared/types/artifact.ts`; server ports: `server/utils/artifact/ports.ts`.
  - Preserve the exported interfaces/method signatures so adapters compile against a common contract. Concrete database/SDK construction is private composition wiring.

| Future module / exports | Responsibility |
| --- | --- |
| `server/utils/artifact/context.utils.ts` / `readCallerContext` | Validate `event.context.caller`; no authentication. |
| `server/utils/artifact/policy.utils.ts` / `canAccessArtifact`, `deriveArtifactAccess` | Pure policy and exact trusted binding intersection; no server needed for unit tests. |
| `server/db/workflow.schema.ts` / `runs`, `steps`, `stepAttempts` | Workflow-owned identity schema and migrations. |
| `server/utils/artifact/workflow-identity.utils.ts` / `createWorkflowIdentityRepository` | Attempt → step → run lookup. |
| `server/db/artifact.schema.ts` / `artifacts` | Artifact metadata and FK migration. |
| `server/utils/artifact/metadata.utils.ts` / `createArtifactMetadataRepository` | Atomic reservation/completion; scoped discovery and ID queries. |
| `server/utils/artifact/azure-url.utils.ts` / `createAzureArtifactUrlIssuer` | Blob-key derivation and SAS issuance; no artifact access decision. |
| `server/utils/artifact/service.utils.ts` / `createArtifactService` | Compose trusted scope, workflow identity, metadata and signer. |

- Ports return discriminated results for expected failures; no thrown H3 errors in adapters.
  - The service catches unexpected exceptions and maps them to sanitized 500. Response serializers select public fields explicitly; they do not return repository records.
- Metadata ports receive server-derived scope/reference, not caller-supplied permissions.
  - Recheck scope on every request. No cached permission from a previous registration or a known artifact ID.

## Dependency proposals and checks

| Use | Proposed baseline |
| --- | --- |
| Contract checks, installed dev dependencies | `@apidevtools/swagger-parser@13.1.0`, `ajv@8.20.0`, `ajv-formats@3.0.1`, `json-schema-to-ts@3.1.1` |
| Runtime validation | Promote the same Ajv/formats versions to runtime; generated shared JSON schemas; no coercion, defaults or removal of unknown fields. |
| Unit / HTTP tests | Node 24 `node:test`, `node:assert/strict`, native fetch; pure policy/context tests first, HTTP tests against built Nitro on a disposable port. |
| Product typecheck | Dev `vue-tsc@3.3.13`, `nuxt typecheck`; not installed/configured here. |
| Persistence | `drizzle-orm@0.45.4`, `pg@8.23.1`; dev `drizzle-kit@0.31.11`, `@types/pg@8.23.1` |
| Azure SAS | `@azure/storage-blob@12.34.0`, `@azure/identity@4.14.0` |

- Only contract-check development dependencies are installed in this PR.
  - Other versions are proposals checked against package metadata/primary docs, not installed or integration-tested. Node 24 meets Azure's Node >=22 engines; vue-tsc declares TypeScript >=5 compatibility.
- Use one lazy `pg.Pool` per Nitro process, `max=5`, UTC session initialization and shutdown cleanup.
  - Database tests need disposable PostgreSQL 17. Native TS unit tests use explicit relative `.ts` imports rather than unresolved Nuxt aliases.
- Primary references: [Ajv schemas](https://ajv.js.org/json-schema.html), [schema-derived types](https://github.com/ThomasAribart/json-schema-to-ts), [Node tests](https://nodejs.org/docs/latest-v24.x/api/test.html), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql).
  - Contract validation is evidence of schema/example consistency, not evidence of runtime authorization, persistence or Blob handoff.

```sh
npm ci
npm run check:artifact-contract
npm run check:guidance
npm run verify
git diff --check
```

- `check:artifact-contract` validates OpenAPI structure with Swagger Parser, compiles schemas with Ajv/formats, checks supplied examples/context-seed relationships, rejects missing/malformed context examples and typechecks the ports.
  - It checks negative example rejection and generated-schema freshness. It does not execute authorization or contact Azure/PostgreSQL; Swagger Parser is not a complete semantic OpenAPI linter.
- `verify` includes that command; `generate:artifact-schemas` refreshes generated constants after contract edits.
  - Later tests must execute access/state/concurrency cases, prove metadata discovery does not call the signer, and prove scope omissions return no foreign records.
- Real Azure tests must upload the five bytes `plan\n`, report completion, obtain a separate read SAS and compare downloaded bytes/hash.
  - Prove create-only overwrite denial even without the conditional header, plus read-only permission boundaries. A fake URL or successful build proves none of this.
