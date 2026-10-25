# Artifact service — design and schema brainstorm

> [!IMPORTANT]
> **Brainstorm, not an implementation specification.** Items under [Agreed](#agreed) are decided; schema fields, task permissions and endpoint contracts remain proposals. Authority: [ADR-003](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/003-platform-services-vs-agent-pods.md) for trust/authentication and [ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md) for artifacts. Nothing here is implemented yet.

## Initial release scope

- Authorize access to a specific artifact and return a scoped Azure Blob SAS URL. Pods transfer bytes directly to/from Blob Storage; the service never streams artifact bytes.
- Own artifact metadata, upload acknowledgment and the artifact task/action policy. Persist instantiated grants only if that implementation is selected.
- Workflows are initially submitted with the Argo Workflows CLI. The service receives trusted run/step/attempt assignments and artifact references; it does not create runs, orchestrate retries, record agent status/usage or manage GitHub tokens.
- No product UI. This is one of two services in the platform-services repository; splitting their handoffs does not decide deployment or database separation.

## Agreed

- Artifact metadata lives in the database; bytes live in Blob Storage.
- Artifact access requires resource/action authorization regardless of HMAC vs. Kubernetes ServiceAccount authentication. Mechanism and policy persistence are separate choices.
- Trusted workflow/platform code establishes assignments and selects exact upstream outputs. Agents cannot assign themselves another role or enlarge their grants.
- Each agent creates its own artifacts. Existing ADR-005 is create-only; create, read and update are distinct policy actions. No update permissions are enabled in this sketch.
- Producer receives a SAS URL, uploads directly to Azure, receives success, then reports completion to this service. Downstream requests follow production in workflow order.
- Agent pods have no Azure workload identity or storage account key. The artifact service uses its own workload identity to obtain a user delegation key and issue SAS URLs.

## Assignment and handoff contract

- Trusted caller assignment: `{ runId, stepId, attemptId, taskType, inputs, outputs }`. The service resolves this from authenticated identity/credentials and trusted platform state, never from a pod-supplied policy.
- Each input/output reference is `{ runId, producerStepId, producerAttemptId, name }`. Caller and producer can differ: coder C1 reads planner P1's plan. Knowing an identifier grants no access.
- An attempt is one execution of a workflow step. If P1's first pod crashes and its second execution produces the plan, C1 receives the reference naming that second execution. Which execution supplies downstream outputs is chosen by trusted workflow/platform code.
- The workflow orders production before consumption. The artifact service authorizes the supplied exact reference; downstream agents do not poll for missing upstream outputs.
- How assignments/bindings reach this service—shared server code/database access or an internal API—is open. It must be authoritative and available before the caller needs artifact access.

The [workflow service handoff](./workflow-service-schema.md) owns run/step/attempt records and credential provisioning/cleanup. The only workflow table referenced by the artifact schema below is `step_attempts(id)`, a UUID primary key. Artifact agents need that identity contract, not the workflow's business schema. In the existing combined database proposal, these are real foreign keys; this document split does not remove them or introduce another database.

## Schema — proposal

PostgreSQL 17, using the existing `workflow` database proposal and Drizzle `pg-core`. No migrations exist. UUID v4 defaults use `gen_random_uuid()`; the broader v4/v7 choice remains open. Use `timestamptz`, UTC service sessions, and explicit snake_case column names. `text(..., { enum })` provides TypeScript typing only; runtime validation/database checks still need a decision.

The examples assume a future `workflow.schema.ts` export solely for the foreign-key target; that module name is illustrative. Do not redefine or migrate the workflow table from the artifact implementation. Generate/review migrations together with its owner so `step_attempts` exists before these foreign keys are applied.

> [!NOTE]
> Schema blocks type-check with drizzle-orm 0.45.4 / TypeScript 7.0.2 when extracted alongside the workflow schema. Combined SQL generation preserves the previous 15-table proposal, including foreign keys and constraints; checked 2026-10-25 without a database. These dependencies are not yet installed in the application.

```ts
import { bigint, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
// Proposed schema-module name. Only the existing step_attempts(id) FK target is needed.
import { stepAttempts } from './workflow.schema'

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
```

### Artifacts

```ts
/**
 * Artifact metadata. Bytes live in Blob Storage; pods transfer them directly with a SAS URL.
 * Identity: producing attempt (→ step → run) + name. No blob path column — the artifact
 * service derives it by convention. No updated_at: create-only (ADR-005).
 */
export const artifacts = pgTable('artifacts', {
  id: id(),
  producerAttemptId: uuid('producer_attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'restrict' }),
  name: text('name').notNull(), // logical name, e.g. plan
  kind: text('kind'), // e.g. summary, notes, log, screenshot (ADR-005)
  contentType: text('content_type'),
  // Agent uploads using the SAS, receives Azure success, then reports completion.
  // reserved → uploaded records that acknowledgment; it does not update artifact bytes.
  state: text('state', { enum: ['reserved', 'uploaded'] }).notNull().default('reserved'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }), // known after upload
  sha256: text('sha256'), // known after upload
  createdAt: createdAt(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
}, table => [
  unique('artifacts_producer_name_unique').on(table.producerAttemptId, table.name),
])
```

### Optional grants

Authorization is required under either authentication mechanism; the [policy sketch](#artifact-policy--proposal) expresses it in code. This table is optional persistence for the exact grants instantiated by trusted workflow/platform code. Whether those grants are stored as rows or resolved from trusted assignments is separate from HMAC vs. Kubernetes ServiceAccount authentication. Artifact identity = run + producing step + producing attempt + name; caller is distinct from producer; workflows pass logical references, never Blob paths or SAS URLs.

```ts
/**
 * Exists if grants are persisted server-side. Caller ≠ producer: the coder (caller)
 * reads the planner's plan (target). Changing target or action must fail authorization.
 * Trusted workflow/platform code creates grants from the policy and assignments.
 * OPEN: exact provisioning timing relative to attempt creation.
 */
export const artifactGrants = pgTable('artifact_grants', {
  id: id(),
  callerAttemptId: uuid('caller_attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  targetProducerAttemptId: uuid('target_producer_attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  targetName: text('target_name').notNull(),
  action: text('action', { enum: ['create', 'read', 'update'] }).notNull(), // distinct actions; policy grants no updates today
  createdAt: createdAt(),
}, table => [
  unique('artifact_grants_unique').on(table.callerAttemptId, table.targetProducerAttemptId, table.targetName, table.action),
])
```

## Artifact policy — proposal

Pattern: [Tally Split `shared/config/task-permissions.js`](https://github.com/julie-ng/tally-split-ai/blob/main/shared/config/task-permissions.js). Keep the allowed actions in one map, then constrain each request to the caller's trusted assignment. Authentication supplies the caller context; it does not grant access to every artifact in the run. The HMAC representation, ServiceAccount validation and whether grants become database rows remain open.

The task/artifact names below are an illustrative coding loop: planner → coder → checks → reviewer, with optional gate, decision and PR-writing steps. The full loop is not adopted by this policy sketch. Task types describe workflow work, independently of GitHub broker roles.

- `artifact/<name>:create`, `:read` and `:update` are separate capabilities. No broad `write` permission.
- Reads require the exact input/output reference bound to this assignment. Creates require the caller's own declared output reference. A matching role or filename alone grants nothing.
- Updates require an explicit `:update` entry and the producing assignment's own output reference. Same-role callers in other steps/attempts do not automatically get update access. No updates are granted below, preserving ADR-005's current create-only rule; enabling them would require revisiting that rule.
- Assignment creation and output-attempt selection remain with trusted workflow/platform code. The artifact service authorizes the bound resource/action; it does not accept new bindings or grants from the requesting agent.
- Unknown tasks/actions/references are denied. The service loads assignments and permissions from trusted platform state, never from a pod-supplied policy or list of grants.

```js
export const ARTIFACT_ACTIONS = ['create', 'read', 'update']

// Illustrative policy keys, not GitHub broker roles or a finalized workflow.
export const TASK_PERMISSIONS = {
  planner: ['artifact/plan:create'],
  'gate-classify': ['artifact/plan:read', 'artifact/gate:create'],
  'approve-plan': [], // human/control-plane gate; no agent credential
  coder: ['artifact/plan:read', 'artifact/handoff:read', 'artifact/coder-notes:create'],
  checks: ['artifact/checks-log:create', 'artifact/diff:create'],
  reviewer: ['artifact/plan:read', 'artifact/diff:read', 'artifact/checks-log:read', 'artifact/review:create'],
  decide: ['artifact/coder-notes:read', 'artifact/checks-log:read', 'artifact/review:read', 'artifact/handoff:create'],
  'pr-writer': ['artifact/plan:read', 'artifact/diff:read', 'artifact/review:read', 'artifact/pr:create'],
  'open-pr': ['artifact/pr:read', 'artifact/pr-result:create'],
}

export function getTaskActions (taskType) {
  if (!Object.hasOwn(TASK_PERMISSIONS, taskType)) {
    return []
  }
  return [...TASK_PERMISSIONS[taskType]].sort()
}

function sameArtifact (left, right) {
  return left.runId === right.runId &&
    left.producerStepId === right.producerStepId &&
    left.producerAttemptId === right.producerAttemptId &&
    left.name === right.name
}

// assignment is loaded server-side for the authenticated caller:
// { runId, stepId, attemptId, taskType, inputs: ArtifactRef[], outputs: ArtifactRef[] }
// ArtifactRef = { runId, producerStepId, producerAttemptId, name }
export function canAccessArtifact (assignment, target, action) {
  if (!ARTIFACT_ACTIONS.includes(action)) {
    return false
  }
  if (!getTaskActions(assignment.taskType).includes(`artifact/${target.name}:${action}`)) {
    return false
  }
  if (target.runId !== assignment.runId) {
    return false
  }

  if (action === 'read') {
    return [...assignment.inputs, ...assignment.outputs].some(ref => sameArtifact(ref, target))
  }

  // Both create and any explicitly enabled update are restricted to own outputs.
  return target.producerStepId === assignment.stepId &&
    target.producerAttemptId === assignment.attemptId &&
    assignment.outputs.some(ref => sameArtifact(ref, target))
}
```

Example binding: coder C1 attempt 1 receives `plan` from planner P1 attempt 2 and declares `coder-notes` under C1 attempt 1. The map permits reading `plan`; the binding selects that exact P1 attempt 2 reference. Changing it to P1 attempt 1, another run, another filename or a create/update action is denied. The same `coder` task type in C2 has its own assignment and grants.

### Upload and downstream handoff

1. Producer asks the artifact service for create access to its assigned output; the service authorizes it and returns a SAS URL.
2. Producer uploads directly to Azure Blob Storage and receives Azure's successful response.
3. Producer reports successful upload to the artifact service against that same output reference. The service scopes this acknowledgment to the producing assignment and records completion metadata.
4. Trusted workflow/platform code passes the selected output attempt's completed artifact reference to the downstream step. The downstream step then asks for read access and receives its own SAS URL.

The workflow orders production before consumption; downstream steps do not poll for artifacts that have not been produced. Upload acknowledgment changes metadata, not artifact contents, and grants no permission to overwrite bytes. Selecting an output attempt does not turn a failed check or rejected review into QA green; its report may itself be the input needed for the next iteration.

## Open

- [ ] Endpoint paths, request/response/error shapes for create authorization, read authorization and upload acknowledgment. Treat the policy above as requirements on those contracts, not a finished route design.
- [ ] Final task/artifact names and permitted input/output bindings for the first implemented workflow.
- [ ] Authentication: HMAC (currently documented) vs. Kubernetes ServiceAccount tokens. Mechanism details remain deferred; do not drop artifact authorization with either choice.
- [ ] Assignment integration: authoritative source and access/transport for trusted caller assignments and exact bindings.
- [ ] Policy persistence: evaluate code policy plus trusted assignments vs. instantiated `artifact_grants` rows; provisioning timing relative to attempt creation is still open.
- [ ] Blob naming convention from logical references, SAS lifetimes and exact permissions for the selected upload operation. Preserve current create-only intent.
- [ ] Upload metadata: which fields are reported by the producer and how repeated acknowledgments behave. Completion means the producer reports Azure success; additional storage-side verification is not selected.
- [ ] Status validation/database checks, retention and deletion behavior for artifacts/grants that reference workflow attempts.

## Decision log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-10-25 | Separate artifact and workflow implementation handoffs | Architect needs to delegate them to different coding agents; keep only assignment/reference and foreign-key integration here. |
| 2026-10-25 | Authorization policy independent of authentication; sketch task/action permissions | Architect confirmed policy remains required under either HMAC or Kubernetes tokens. Tally Split's map is the reference; exact policy entries and persistence remain proposals. |
| 2026-10-25 | Producer acknowledges upload after Azure success; workflow orders downstream consumption | Architect clarified the intended handoff. Recording completion metadata does not grant permission to update bytes. |
| 2026-10-25 | Artifact metadata in the database | Architect confirmed; bytes remain in Blob Storage. |

### Accepted trade-offs

| Trade-off | Notes |
|---|---|
| Workflow-assignment dependency | Requires trusted identity/binding information, without taking ownership of workflow execution state. |

## References

- [Tally Split task permissions](https://github.com/julie-ng/tally-split-ai/blob/main/shared/config/task-permissions.js) — pattern for the code policy; its application-specific resources and child-task issuance are not imported.
- [Azure user delegation SAS permissions](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas#specify-permissions) — distinguish create/read/write capabilities when implementing URL issuance.
