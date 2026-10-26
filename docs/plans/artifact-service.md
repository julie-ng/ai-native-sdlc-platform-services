# Artifact service — contract baseline proposal

> [!IMPORTANT]
> Contract/documentation only. No artifact API, persistence or Azure adapter is implemented. Issue #5 uses the [pinned artifact plan](https://github.com/julie-ng/ai-native-sdlc-platform-services/blob/67c4f98d81c2a96d4f80c0bc8ecaf25a985ede6e/docs/plans/artifact-service.md) as reference, not approval of its proposals. The [choice provenance table](../api/README.md#choice-provenance) explicitly labels inherited requirements, inherited proposals selected here, and choices absent from the pinned plan. All new selections await this PR's review.

## Purpose and boundaries

Own artifact metadata and authorize direct Azure Blob access for workflow callers. Return scoped SAS URLs and acknowledgments; never receive, stream or return artifact bytes. Metadata lives in the planned PostgreSQL 17 `workflow` database via Drizzle; bytes live in Blob Storage. No deployed database or storage account access is assumed.

The workflow service owns runs, logical steps, execution attempts, trusted assignments and selection of upstream output executions. The artifact service consumes those identities and bindings. An attempt is one execution of a step; another iteration is a different step. Credentials do not give a caller authority over every artifact in its run or every artifact produced by the same task type.

This slice excludes updates to artifact content, workflow endpoints, Kubernetes/Argo integration, GitHub broker work, webhook ingress, product UI and LLM calls. Production HMAC versus Kubernetes caller authentication, real credentials and cluster assignment delivery remain deferred. They must preserve the authorization contract.

## Contract and examples

The proposed end state is fully specified in the [HTTP/adapter contract](../api/README.md), [OpenAPI document](../api/artifact.openapi.json), [examples](../api/examples.json) and [compile-checked TypeScript ports](../api/artifact-ports.ts).

| Operation | Contract behavior |
| --- | --- |
| `POST /api/artifacts/upload-authorizations` | Authorize own declared output; atomically reserve metadata; return create-only single-blob SAS. New reservation 201; identical reserved repeat 200; incompatible or completed reference 409. |
| `POST /api/artifacts/upload-acknowledgments` | Producer reports Azure success and required size/hash; atomically mark uploaded. Identical repeat 200 without timestamp changes; differing completion 409. Response only reference/state. |
| `POST /api/artifacts/read-authorizations` | Authorize exact assigned input/output with an explicit read capability; uploaded target returns read-only SAS and allowlisted metadata. Authorized missing target 404; reserved target 409. |

Every operation resolves caller context server-side, validates closed request schemas, authorizes the exact resource/action before metadata access, and never expands permissions from HTTP input. Unresolved caller 401; known ungranted caller 403; malformed input 400; structured errors and field allowlists are specified in OpenAPI. No update capability is granted. A write-only producer does not receive a read URL or the stored row.

Upload completion means the producer received Azure's successful upload response and reports it. The service records that report without independently verifying Blob content. Acknowledgment changes metadata, grants no overwrite permission, and does not revoke already issued URLs. Additional Azure-side content verification is not a selected requirement.

## Trusted assignment and fixture handoff

Assignment: `{ runId, stepId, attemptId, taskType, inputs, outputs }`. Artifact reference: `{ runId, producerStepId, producerAttemptId, name }`. Only trusted workflow/platform code establishes assignments and selects the execution supplying downstream outputs. Callers cannot submit replacement roles, permissions or bindings. The artifact reference selects a resource; knowing it grants nothing.

The selected first fixture is planner P1/execution 1 in run A producing logical `plan`, then coder C1/execution 1 in run A consuming exactly that reference. The five example bytes are `plan\n`. Workflow code orders completion before consumption; downstream callers do not poll. Changed run B, step, producer execution, name or action is denied, as are unknown tasks and same-role callers attempting another producer's write. Exact UUID/token bindings live in [test-only assignments](../api/assignments.fixture.json), not conversation history.

This PR selects only planner `plan:create` and coder `plan:read` from the old illustrative coding-loop policy. No other task capabilities or full coding loop are adopted. The selected source is an injected in-process trusted resolver plus code policy; no optional `artifact_grants` table is required. The default resolver rejects all callers. Fixture token maps require explicit test injection and `NODE_ENV=test`; they are not a production identity provider.

## Persistence and storage

Artifact metadata: `id`, `producerAttemptId`, `name`, `kind`, `contentType`, `state` (`reserved`/`uploaded`), `sizeBytes`, `sha256`, `createdAt`, `uploadedAt`. Unique producer attempt/name; UUID references and server-owned timestamps. Use `timestamptz`, UTC sessions and SQL checks, not enum type hints alone. No SAS URL, blob path or `updatedAt` column. The [contract](../api/README.md#validation-and-metadata) settles nullability, validation limits and field ownership.

Preserve `producerAttemptId -> step_attempts(id) ON DELETE RESTRICT`. The [workflow-owned identity prerequisite](../api/README.md#assignment-resolution-and-workflow-identity) specifies minimal run/step/attempt schema exports, migration ordering and disposable PostgreSQL fixture seeding. The artifact adapter must import the workflow owner's `stepAttempts` export; it must neither create a competing workflow schema nor remove the FK. Full workflow endpoints are unnecessary for this prerequisite.

Blob key: `v1/runs/{runId}/steps/{producerStepId}/attempts/{producerAttemptId}/artifacts/{name}`. Logical names have no filename suffix or path syntax. URLs last 300 seconds and scope to one blob: upload `c`, download `r`, HTTPS only. Upload uses single Put Blob with a create-only SAS; overwrite requires Azure's separate `w` permission, which is never issued. The service holds the Azure identity; caller processes hold only SAS URLs. Full retry, headers and SDK behavior are specified in the [storage contract](../api/README.md#storage-contract).

## Implementation sequence after contract merge

1. Local policy/HTTP: implement shared schemas, explicit caller guard, selected task map and three operations against injected metadata/signer doubles. Execute every success/failure example and policy denial; prove denied requests never invoke metadata/signing. This proves local application behavior only.
2. Durable metadata: workflow owner supplies the minimal identity schema/seed contract, then artifact owner supplies migrations and adapters. Use disposable PostgreSQL 17 to prove FK, uniqueness, concurrent reservation/completion and restart durability.
3. Real Blob handoff outside Kubernetes: use a separately configured service development identity, upload directly with `c`, acknowledge success, download with `r`, compare bytes/hash and prove overwrite/read-permission denials against Azure. A fake URL or successful build does not prove this handoff.
4. Cluster integration later: replace fixtures with production identity and trusted platform assignment delivery; repeat the same handoff between pods. No change to reference/action scope is implied.

Retention/abandoned-reservation cleanup, binary smoke examples and additional coding-loop tasks are future features, not missing choices for this slice. The [dependency proposals and verification instructions](../api/README.md#dependency-proposals-and-verification) select the implementation baseline and distinguish installed contract tooling from future adapters.

## Verification and provenance

On Node 24, run `npm ci`, `npm run check:artifact-contract`, `npm run check:guidance`, `npm run verify` and `git diff --check`. Contract validation checks OpenAPI schemas and supplied positive/negative examples, plus port compilation. It does not claim authentication, policy execution, persistence or Azure behavior exists.

| Date / status | Record |
| --- | --- |
| 2026-10-25 / reference only | Pinned artifact/workflow plans described metadata ownership, direct Blob transfer, trusted assignments, create-only access and a proposed PostgreSQL/Drizzle model. Their HTTP contracts and other open choices were not committed decisions. |
| 2026-10-26 / proposed in issue #5 | This PR supplies concrete HTTP/schema/adapter/storage/retry/fixture choices with explicit provenance. Review and merge are the decision point; no product implementation is included. |

External design links from the pinned plans are background: [ADR-003](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/003-platform-services-vs-agent-pods.md), [ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md), and [task-policy pattern](https://github.com/julie-ng/tally-split-ai/blob/main/shared/config/task-permissions.js). No external repository or parent temporary directory is required to implement this contract.
