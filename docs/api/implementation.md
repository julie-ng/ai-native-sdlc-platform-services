# Artifact implementation contract

See the [API overview](./README.md) for operations, access policy, and POC assumptions.

## Validation and errors

- POST/PUT require `application/json` (optional UTF-8 charset), with an 8 KiB body limit. Invalid/missing JSON: 400; oversized body: 413; other media types: 415. GET has no body; reject all query parameters.
- Validate with the [Zod schemas](../../shared/utils/zod-schemas/index.ts). Objects are closed at every level: no coercion, trimming, defaults, transforms, or unknown-field stripping.
- IDs are lowercase UUID v4; names/kinds are 1–64 character slugs, not filenames. Content type is a bare lowercase type/subtype. Completion accepts integer size 0–1,000,000 bytes and a lowercase 64-character SHA-256. Exact constraints are defined in [common schemas](../../shared/utils/zod-schemas/common.schema.ts).
- Return `Cache-Control: no-store`. Unsupported methods return 405 with the route's `Allow` header. Never redirect to SAS URLs.
- Errors use `{ error: { code, message, fields? } }`. Only 400 includes `fields`: 1–20 JSON-pointer paths/categories, without input values. Use `''` for missing/malformed bodies and `/query` for forbidden query fields.
- Map `forbidden` → 403, `not_found` → 404, `conflict` → 409, `unavailable` → 503, and unexpected errors → sanitized 500. Never expose resource fields, SQL details, stack traces, credentials, or SAS URLs in errors.

## Caller context and authorization

Trusted middleware provides `event.context.caller`:

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

- Validate with `readCallerContext`: at most 64 inputs and 64 outputs, all in the caller's run; outputs belong to its step. Missing/malformed context returns 503 `CALLER_CONTEXT_UNAVAILABLE`; other unavailable dependencies use `DEPENDENCY_UNAVAILABLE`.
- Context comes from middleware, never HTTP claims or workflow-step lookups. Fixed contexts are test-only; authentication failures belong to upstream middleware.
- `deriveArtifactAccess` intersects task policy with exact bindings and de-duplicates references. Scope existence lookups to the union of read/create/update grants; scope discovery to read grants only. Unknown tasks yield empty scopes.
- Process requests in order: context validation → HTTP validation → scoped lookup → requested-action check → operation/signing. Ingress size limits may run earlier. Never use unrestricted lookups to distinguish 403/404.
- POST derives the own-output reference from `name`. Outside scope: 404; scoped missing target with create permission: insert; existing target without the required action: 403. Require both create and update permission before issuing upload SAS.
- Completion requires create permission for a reserved artifact and update permission for an uploaded artifact, always within own-output scope.

## Metadata and repeat writes

- `findOrCreate` atomically inserts or returns one record per step/name. First kind/title/description wins; ignore later descriptive changes. Changed content type returns 409.
- Reserved metadata omits size/hash/uploaded time. Uploaded metadata includes them. Both include `createdAt`/`updatedAt` and public descriptive fields; neither includes internal references or SAS URLs.
- Discovery includes existing readable records in either state, ordered by `createdAt`, then `id`, ascending. Return an empty collection if none; unregistered bindings produce no records. At most 128 bound references, without pagination.
- Upload registration returns only `id`, current `state`, and `upload`; completion returns only `id` and `state: uploaded`.
- Each permitted POST signs a fresh upload URL. Signing failure returns 503 while preserving registration for retry; do not look up or store previous URLs.
- Each accepted completion, including identical retries, replaces size/hash/state and refreshes `uploadedAt`/`updatedAt`. These are acknowledgment times, not verified Azure upload times. No history or blob HEAD/download/hash verification.
- Metadata GET accepts either state; download SAS requires `uploaded` state, otherwise 409 after authorization. Metadata/discovery never calls the signer.

## Persistence and workflow ownership

- Use PostgreSQL 17, Drizzle/node-postgres, and the shared `workflow` database. Use one lazy `pg.Pool` per Nitro process, `max=5`, UTC sessions, and shutdown cleanup.
- Artifact fields: `id`, `producerStepId`, `name`, `kind`, `title`, `description`, `contentType`, `state`, `sizeBytes`, `sha256`, `createdAt`, `updatedAt`, `uploadedAt`. No attempt, revision, SAS, or blob-key columns.
- Require UUID primary key, unique `(producer_step_id, name)`, and `producer_step_id -> steps(id) ON DELETE RESTRICT`. Join the workflow-owned step to validate run membership.
- Workflow owns `runs(id uuid PRIMARY KEY)` and `steps(id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE RESTRICT)`. Import its `steps` export; apply workflow migrations before artifact migrations in one journal.
- Enforce field constraints with SQL CHECKs. `contentType` is NOT NULL; absent optional descriptions become SQL NULL and are omitted from responses. Size/hash/uploaded time are all NULL when reserved and all present when uploaded.
- Store timestamps as NOT NULL `timestamptz` for creation/update, with equal registration defaults. Keep `createdAt` fixed; explicitly update `updatedAt` and `uploadedAt` with one DB transaction timestamp in the same completion UPDATE. Serialize UTC with `Z`.
- Repeated POSTs, reads, failures, and denials leave rows/timestamps unchanged. Avoid automatic update hooks that would violate this rule.
- Use [caller fixtures](./caller-contexts.fixture.json) for disposable database tests of foreign keys, run membership, uniqueness, stable IDs, report replacement, timestamp lifecycle, and restart durability.

## SAS and storage

- Private config: `artifactStorageAccountUrl` (required HTTPS), `artifactStorageContainer` (default `artifacts`), and `databaseUrl` (required). Use the service's credential chain; missing configuration/identity returns sanitized 503.
- Derive the stable blob key from the validated, server-selected reference:

```text
v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}
```

- Issue HTTPS, single-blob user delegation SAS (`sr=b`, `spr=https`) lasting 300 seconds. Omit `startsOn`; the delegation key must cover the full lifetime. Never persist or log SAS URLs.

| Operation | SAS permission | Transfer |
| --- | --- | --- |
| Upload/overwrite | `sp=w` | Single PUT with `x-ms-blob-type: BlockBlob`, stored Content-Type, and client-computed Content-Length. No `If-None-Match: *`. |
| Download | `sp=r` | GET the current blob. No write/list/delete permission. |

- SAS issuance/completion does not revoke earlier URLs or coordinate metadata with blob contents. The reported-size limit is not an Azure upload-size restriction.
- Disable automatic Blob versioning if storage must retain no revisions; overwriting one key alone does not prevent Azure version history.
- Verify real Azure upload, overwrite, and download using `plan` plus LF, then `revised plan` plus LF. Check stable ID/key and read-only permission boundaries.

References: [user delegation SAS](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas), [Put Blob permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob#user-delegation-sas), and [Blob versioning](https://learn.microsoft.com/en-us/azure/storage/blobs/versioning-overview).

## Code boundaries

- [Server ports](../../server/utils/artifact/ports.ts) define service/repository/signer interfaces. Adapters return discriminated results for expected failures; the service sanitizes unexpected exceptions. Select response fields explicitly rather than returning repository rows.
- Domain/context payload types in [shared types](../../shared/types/artifact.ts) use `z.infer`. Use the shared domain schemas directly at runtime; keep authorization and cross-field ownership checks in explicit functions.

## Schema workflow

| Edit | Purpose |
| --- | --- |
| `shared/utils/zod-schemas/*.schema.ts` | Runtime validation and inferred types; OpenAPI schema source. |
| `scripts/openapi/artifact-http.ts` | Methods, paths, responses, and HTTP documentation. |
| `docs/api/examples.json` / `caller-contexts.fixture.json` | Shared authored examples and test fixtures. |

Run `npm run generate:artifact-openapi`, review and commit the generated JSON, then run `npm run verify` and `git diff --check`. Never hand-edit OpenAPI. Dependency versions live in `package.json` and the lockfile.

Contract tests check schema/example parity, generated-file freshness, and fixture consistency. Unit tests cover implemented schema/context/policy/key behavior. Actual service/HTTP, PostgreSQL, and Azure tests must establish orchestration and integration behavior.
