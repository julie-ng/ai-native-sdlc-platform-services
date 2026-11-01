# Artifact implementation contract

See the [API overview](./README.md) for operations, access policy, and POC assumptions.

## Request handling

Each route under `server/api/artifacts/` runs, in order:

1. `requireCallerContext(event)`: the explicit guard that establishes `event.context.caller`; 503 if it cannot. Today it only validates a context that nothing sets yet; #13 replaces its body with authentication that constructs the context.
2. Validate the body and `id` route parameter with the strict [Zod schemas](../../shared/utils/zod-schemas/index.ts); 400 on failure, with `z.flattenError()` output in `data`. h3 rejects malformed JSON with 400.
3. [`requireArtifactConfiguration(event)`](../../server/utils/guards/require-artifact-configuration.ts): 503 unless the database URL and storage settings are configured.
4. [`requireArtifactAccess`](../../server/utils/guards/require-artifact-access.ts) for routes with an ID, or `requireArtifactPermission` for registration: 404 or 403 as below.
5. Call the [repository](../../server/utils/artifact/repository.utils.ts) and [SAS](../../server/utils/artifact/azure-sas.utils.ts) functions directly and return the response; download returns 409 unless the state is `uploaded`.

- Errors use Nitro's `createError()` JSON (`statusCode`, `message`, optional `data`). Errors never include artifact fields, SQL details, credentials or SAS URLs; unexpected database or Azure failures are sanitized 500s.
- Objects are closed at every level: no coercion, trimming, defaults, transforms, or unknown-field stripping. Exact constraints are in [common schemas](../../shared/utils/zod-schemas/common.schema.ts).
- Responses that carry SAS URLs set `Cache-Control: no-store`. Never redirect to SAS URLs.
- Unknown `/api` paths return JSON 404. Unsupported methods on existing paths still fall through to the Nuxt page renderer; this is a known gap, not a contract.

## Caller context and authorization

The `requireCallerContext` guard establishes `event.context.caller`:

```ts
{
  runId,     // workflow instance
  stepId,    // caller's logical step
  taskType,  // server-established work type
  inputs,    // bound input references
  outputs,   // bound own-output references
}
// Each reference: { runId, producerStepId, name }
```

- `readCallerContext` requires all bindings in the caller's run and outputs owned by its step. Context comes only from the guard's authentication, never HTTP claims or workflow-step lookups. Fixed contexts are test-only.
- [`canAccessArtifact`](../../server/utils/artifact/policy.utils.ts) applies the task policy to one exact reference and action: planners create and update their own `plan` outputs, coders read `plan` references among their bindings. Create and update stay distinct, mirroring Azure's `c`/`w` SAS permissions. Unknown tasks get nothing.
- The `requireArtifactAccess` guard looks up an ID and sets `event.context.artifact`:

```ts
const record = await findArtifactById(useDB(), id)
if (!record || !isArtifactVisible(caller, record.reference)) → 404
if (!canAccessArtifact(caller, record.reference, action))    → 403
```

- Visible means any granted action. Responses for missing and invisible artifacts are identical, so the lookup itself does not need to be scoped.
- POST derives the reference from the caller's own step and `name`. It needs both create and update because the issued SAS can overwrite.
- An upload report needs create for a reserved artifact and update for an uploaded one. Metadata and download need read; download also needs `uploaded` state (otherwise 409, including after a `failed` report).
- Discovery lists records matching the caller's readable references, ordered by `createdAt`, then `id`. Unregistered bindings produce no records.

## Metadata and repeat writes

- `upsertArtifact` inserts one record per step/name or replaces its kind/title/description/content type (last write wins; omitted optional fields become NULL). State, size and hash are kept. Each permitted POST signs a fresh upload URL; signing failure leaves the registration for retry. URLs are never stored.
- Reserved and failed metadata omit size/hash; uploaded metadata includes them. Uploaded and failed metadata include `details` when the latest report had them. All include `createdAt`/`updatedAt` and descriptive fields, never internal references or SAS URLs.
- Upload registration returns only `id`, current `state`, and `upload`; an upload report returns only `id` and the reported `state` (`uploaded` or `failed`).
- Each accepted upload report, including identical retries, replaces the state, size/hash and `details`: `uploaded` sets size/hash, `failed` clears them, and omitted details are cleared. Last report wins; no history; no blob HEAD/download/hash verification.

## Persistence and workflow ownership

- PostgreSQL 17 with Drizzle/node-postgres. [Schema](../../server/db/schema.ts) and generated [migrations](../../server/db/migrations/) live under `server/db/`. One lazy `pg.Pool` (max 5) per Nitro process, shared with the readiness check through `useDB()`, closed on shutdown. Connecting or waiting for a free connection times out after 5 seconds. Idle connection errors are logged, not fatal.
- `artifacts`: `id`, `producer_step_id`, `name`, `content_type`, `kind`, `title`, `description`, `state`, `size_bytes`, `sha256`, `details`, `created_at`, `updated_at`. Unique `(producer_step_id, name)`; `producer_step_id → steps(id) ON DELETE RESTRICT`; a CHECK ties state to the report columns: reserved has no size/hash/details, uploaded has size/hash, failed has neither size nor hash. No attempt, revision, SAS or blob-key columns.
- Workflow-owned `runs(id)` and `steps(id, run_id → runs)` are minimal stubs until the workflow service exists. Lookups join `steps` so references carry the step's actual run; registration fails if the step is not in the caller's run.
- `created_at` is fixed. `updated_at` is set explicitly to `now()` by every accepted write (repeated POST or upload report); reads and denials leave it unchanged.
- [Repository tests](../../tests/integration/artifact-repository.test.ts) run against a disposable database: constraints, run membership, stable IDs, metadata replacement, report replacement, timestamps and a fresh connection pool. [Guard tests](../../tests/integration/artifact-guards.test.ts) cover the planner-to-coder handoff and 404/403 decisions on stored artifacts.

## SAS and storage

- Private runtime config: `NUXT_DATABASE_URL`, `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL` (HTTPS) and `NUXT_ARTIFACT_STORAGE_CONTAINER` (default `artifacts`). Missing configuration returns 503. The Blob client authenticates with `DefaultAzureCredential` (workload identity in a cluster, `az login` locally) and needs container data access plus the user delegation key action at storage account scope or above (see [README](../../README.md#runtime-configuration)).
- The blob key is derived from the reference, never from the request:

```text
v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}
```

- [`signUpload` and `signDownload`](../../server/utils/artifact/azure-sas.utils.ts) issue HTTPS, single-blob user delegation SAS URLs (`sr=b`, `spr=https`) lasting 300 seconds, without a start time. The delegation key covers the full lifetime. Never persist SAS URLs; they may appear in logs (accepted risk, see the [decision log](../architecture.md#decision-log)).

| Operation | SAS permission | Transfer |
| --- | --- | --- |
| Upload/overwrite | `sp=w` | Single PUT with `x-ms-blob-type: BlockBlob` and the stored Content-Type. |
| Download | `sp=r` | GET the current blob. |

- SAS issuance does not revoke earlier URLs or coordinate metadata with blob contents. Disable Blob versioning if storage must retain no revisions.
- Real Azure upload, overwrite and download have not been exercised yet; signing tests run offline with a fixed test key.

References: [user delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas), [Put Blob permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas), and [Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview).

## Code boundaries

- Routes call guards, then plain functions; there is no service layer or adapter interface. Guards and routes throw `createError()` for expected 403/404/409/503 results. Repository and SAS functions throw ordinary errors on unexpected failures, which Nitro reports as sanitized 500s.
- Internal types live with their code: `ArtifactRecord` in the repository, `ArtifactAction` in the policy.
- Payload types in [shared types](../../shared/types/artifact.ts) use `z.infer`.

## Schema workflow

| Edit | Purpose |
| --- | --- |
| `shared/utils/zod-schemas/*.schema.ts` | Runtime validation and inferred types; OpenAPI schema source. |
| `scripts/openapi/artifact-http.ts` | Methods, paths, responses, documentation examples. |
| `server/db/schema.ts` | Persistence; run `npm run db:generate` and commit the reviewed SQL. |

Run `npm run generate:artifact-openapi` after schema/HTTP edits and commit the generated JSON. Never hand-edit OpenAPI or migrations. Contract tests check generated-file freshness, OpenAPI validity and that documentation examples satisfy their schemas.
