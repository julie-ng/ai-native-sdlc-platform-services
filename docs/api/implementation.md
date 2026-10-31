# Artifact implementation contract

See the [API overview](./README.md) for operations, access policy, and POC assumptions.

## Request handling

Each route under `server/api/artifacts/` runs, in order:

1. `requireCallerContext(event)`: the explicit guard that establishes `event.context.caller`; 503 if it cannot. Today it only validates a context that nothing sets yet; #13 replaces its body with authentication that constructs the context.
2. Validate the body and `id` route parameter with the strict [Zod schemas](../../shared/utils/zod-schemas/index.ts); 400 on failure, with `z.flattenError()` output in `data`. h3 rejects malformed JSON with 400.
3. Call the [artifact service](../../server/utils/artifact/service.utils.ts) and return its result.

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
- `deriveArtifactAccess` intersects task policy with exact bindings into `readable`, `creatable` and `updatable` references. Create and update stay distinct, mirroring Azure's `c`/`w` SAS permissions. Unknown tasks get nothing.
- ID lookups use this sequence in the service:

```ts
const record = await repository.findById(id)
if (!record || !isArtifactVisible(caller, record.reference)) → 404
if (!canAccessArtifact(caller, record.reference, action))    → 403
```

- Visible means any granted action. Responses for missing and invisible artifacts are identical, so the lookup itself does not need to be scoped.
- POST derives the reference from the caller's own step and `name`. It needs both create and update because the issued SAS can overwrite.
- An upload report needs create for a reserved artifact and update for an uploaded one. Metadata and download need read; download also needs `uploaded` state (otherwise 409).
- Discovery lists records matching the caller's readable references, ordered by `createdAt`, then `id`. Unregistered bindings produce no records.

## Metadata and repeat writes

- `upsert` inserts one record per step/name or replaces its kind/title/description/content type (last write wins; omitted optional fields become NULL). State, size and hash are kept. Each permitted POST signs a fresh upload URL; signing failure leaves the registration for retry. URLs are never stored.
- Reserved metadata omits size/hash; uploaded metadata includes them. Both include `createdAt`/`updatedAt` and descriptive fields, never internal references or SAS URLs.
- Upload registration returns only `id`, current `state`, and `upload`; an upload report returns only `id` and `state: uploaded`.
- Each accepted upload report, including identical retries, replaces size/hash and sets `state: uploaded`. No history; no blob HEAD/download/hash verification.

## Persistence and workflow ownership

- PostgreSQL 17 with Drizzle/node-postgres. [Schema](../../server/db/schema.ts) and generated [migrations](../../server/db/migrations/) live under `server/db/`. One lazy `pg.Pool` (max 5) per Nitro process, shared with the readiness check through `useDB()`, closed on shutdown. Connecting or waiting for a free connection times out after 5 seconds. Idle connection errors are logged, not fatal.
- `artifacts`: `id`, `producer_step_id`, `name`, `content_type`, `kind`, `title`, `description`, `state`, `size_bytes`, `sha256`, `created_at`, `updated_at`. Unique `(producer_step_id, name)`; `producer_step_id → steps(id) ON DELETE RESTRICT`; a CHECK keeps size/hash NULL when reserved and present when uploaded. No attempt, revision, SAS or blob-key columns.
- Workflow-owned `runs(id)` and `steps(id, run_id → runs)` are minimal stubs until the workflow service exists. Lookups join `steps` so references carry the step's actual run; registration fails if the step is not in the caller's run.
- `created_at` is fixed. `updated_at` is set explicitly to `now()` by every accepted write (repeated POST or upload report); reads and denials leave it unchanged.
- [Repository tests](../../tests/integration/artifact-repository.test.ts) run against a disposable database: constraints, run membership, stable IDs, metadata replacement, report replacement, timestamps and a fresh connection pool.

## SAS and storage

- Private runtime config: `NUXT_DATABASE_URL`, `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL` (HTTPS) and `NUXT_ARTIFACT_STORAGE_CONTAINER` (default `artifacts`). Missing configuration returns 503. The Blob client authenticates with `DefaultAzureCredential` (workload identity in a cluster, `az login` locally) and needs container data access plus the user delegation key action at storage account scope or above (see [README](../../README.md#runtime-configuration)).
- The blob key is derived from the reference, never from the request:

```text
v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}
```

- [`createAzureUrlIssuer`](../../server/utils/artifact/azure-sas.utils.ts) issues HTTPS, single-blob user delegation SAS URLs (`sr=b`, `spr=https`) lasting 300 seconds, without a start time. The delegation key covers the full lifetime. Never persist SAS URLs; they may appear in logs (accepted risk, see the [decision log](../architecture.md#decision-log)).

| Operation | SAS permission | Transfer |
| --- | --- | --- |
| Upload/overwrite | `sp=w` | Single PUT with `x-ms-blob-type: BlockBlob` and the stored Content-Type. |
| Download | `sp=r` | GET the current blob. |

- SAS issuance does not revoke earlier URLs or coordinate metadata with blob contents. Disable Blob versioning if storage must retain no revisions.
- Real Azure upload, overwrite and download have not been exercised yet; issuer tests sign offline with a fixed test key.

References: [user delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas), [Put Blob permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas), and [Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview).

## Code boundaries

- [Server ports](../../server/utils/artifact/ports.ts) define the repository and URL issuer interfaces. Adapters throw on unexpected failures; the service returns expected 403/404/409 results; routes map them with `createError()`.
- Payload types in [shared types](../../shared/types/artifact.ts) use `z.infer`.

## Schema workflow

| Edit | Purpose |
| --- | --- |
| `shared/utils/zod-schemas/*.schema.ts` | Runtime validation and inferred types; OpenAPI schema source. |
| `scripts/openapi/artifact-http.ts` | Methods, paths, responses, documentation examples. |
| `server/db/schema.ts` | Persistence; run `npm run db:generate` and commit the reviewed SQL. |

Run `npm run generate:artifact-openapi` after schema/HTTP edits and commit the generated JSON. Never hand-edit OpenAPI or migrations. Contract tests check generated-file freshness, OpenAPI validity and that documentation examples satisfy their schemas.
