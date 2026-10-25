# Workflow service — database schema brainstorm

> [!IMPORTANT]
> **Brainstorm, not a schema.** Only the items under [Agreed](#agreed) are decided. Everything else is a proposal to iterate on. Design authority stays with the [architecture docs and ADRs](https://github.com/julie-ng/ai-native-sdlc/tree/main/architecture) — mainly [ADR-003](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/003-platform-services-vs-agent-pods.md), [ADR-004](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/004-orchestration-argo-workflows.md), [ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md), [ADR-009](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/009-stop-conditions.md) and [04 · Workflow](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/04-workflow.md).

The Argo side of the same contract — what templates must emit and stamp so these tables can be filled — lives in the workflows repo: `docs/schema-contract.md`.

## Context

- Database `workflow` on the shared PostgreSQL Flexible Server; Argo has its own database `argo` on the same server ([ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md); infrastructure `defaults.auto.tfvars`).
- Server version: **PostgreSQL 17** (`postgres_version = "17"` in infrastructure `defaults.auto.tfvars`, checked 2026-10-25). Matters for UUID generation — see [Identifiers](#identifiers).
- The workflow service is the system of record: runs, retries, start times, per-task cost from goose token usage ([ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md)).
- The artifact service authorizes access and issues Blob SAS URLs; pods transfer bytes directly to/from Blob Storage ([02 · Architecture](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/02-architecture.md#state), merged 2026-10-23).

## Agreed

Architect answers, 2026-10-25.

- **Artifact metadata lives in the database.**
- **Own run UUID**, independent of Argo. Target: GitHub webhook → workflow service, which owns the ID. The POC triggers from the Argo CLI; the schema still carries our own run UUID.
- **One active run per issue.** Several concurrent runs for one issue are waste.
- **Raw token counts always stored.** Price too, if cheap. Currency: as configured — USD for now.
- **Token counts are user feedback, not governance.** Spend limits are enforced at the AI gateway.
- **Projects table.** Repositories are a relation, not repeated name columns on runs. Projects carry UI metadata (description etc.).
- **GitLab out of scope** for code.
- **Step ≠ step attempt.** Separate entities.
- **Step status comes from agent reports.**
- **Different kinds of cap**, not one cap with several names — see [Caps](#caps).
- Where the 2026-10-21 workflow comparison handoff conflicts with ADR-009, ADR-009 applies.

## Schema — proposal

Drizzle `pg-core` definitions, one block per entity group so each line can be commented on. Conventions follow [tally-split-ai `server/db/schema.ts`](https://github.com/julie-ng/tally-split-ai/blob/main/server/db/schema.ts): explicit snake_case column names, camelCase keys, `timestamptz`, `text` with `{ enum }`, `relations()` declared separately. The difference: IDs are `uuid().defaultRandom()`, not text IDs.

> [!NOTE]
> Not a migration. The blocks, concatenated, type-check against drizzle-orm 0.45.4 / TypeScript 7.0.2, and `drizzle-kit generate` produces the SQL — checked 2026-10-25 against no database. Status values are placeholders until the states to-do is done.

`// OPEN:` marks undecided choices, `UNVERIFIED:` unchecked claims.

### Shared

- `text('…', { enum })` types the column in TypeScript only. The generated SQL has **no** `CHECK` — database enforcement needs an explicit `check()`, like `runs_outcome_when_finished` below.
- Not `pgEnum`: "Existing values cannot be removed from an enum type, nor can the sort ordering of such values be changed, short of dropping and re-creating the enum type" ([enums](https://www.postgresql.org/docs/17/datatype-enum.html)).

```ts
import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// v4 via gen_random_uuid() — built in on PostgreSQL 17. OPEN: v7 (built in from PG 18, or app-generated)
const id = () => uuid('id').primaryKey().defaultRandom()

// timestamptz: stored in UTC, set session TimeZone=UTC
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// text + { enum }, not pgEnum: enum values can't be removed without recreating the type.
// PLACEHOLDERS — the states to-do is open; these are illustrative, not a proposed set.
export const RUN_STATUSES = ['pending', 'running', 'finished'] as const
export const RUN_OUTCOMES = ['green', 'escalated', 'failed', 'cancelled'] as const
export const ATTEMPT_STATUSES = ['queued', 'running', 'finished'] as const

// ADR-012 role table. OPEN: ADR-014 names architect + coder as committing roles — reconcile
export const ROLES = ['planner', 'coder', 'reviewer', 'open-pr'] as const

export const TRIGGER_SOURCES = ['webhook', 'cli'] as const
```

### Projects and repositories

```ts
/**
 * A project the platform works on. Holds UI metadata.
 * OPEN: start 1:1 or 1:N with repositories. Projects with submodules are 1:N.
 */
export const projects = pgTable('projects', {
  id: id(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A GitHub repository. Runs reference this, never a name string.
 * One run → one repository: the broker scopes each token to one repository.
 */
export const repositories = pgTable('repositories', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'restrict' }),
  // GitHub numeric repo ID. bigint: no int32 assumption. UNVERIFIED: guaranteed stable across rename/transfer
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull().unique(),
  fullName: text('full_name').notNull(), // owner/repo — changes on rename/transfer, display only
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Triggers and loop types

```ts
/**
 * Why a run started — or why an event was ignored (04: trigger filtering).
 * CLI-submitted POC runs get a row too, so every run has exactly one trigger.
 */
export const triggers = pgTable('triggers', {
  id: id(),
  source: text('source', { enum: TRIGGER_SOURCES }).notNull(),
  // X-GitHub-Delivery GUID. Unique → a redelivered event can't start a second run.
  // NULL for CLI; PostgreSQL treats NULLs as distinct in unique constraints.
  githubDeliveryId: text('github_delivery_id').unique(),
  event: text('event'), // X-GitHub-Event, e.g. issues, issue_comment
  action: text('action'), // payload action, e.g. labeled
  repositoryId: uuid('repository_id').references(() => repositories.id, { onDelete: 'restrict' }),
  issueNumber: integer('issue_number'),
  accepted: boolean('accepted').notNull(),
  ignoredReason: text('ignored_reason'), // e.g. no opt-in label, agent's own comment
  // OPEN: raw payload column — measure payload size first
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A coding-loop type: Argo WorkflowTemplate + its caps.
 * ADR-009: per loop only the cap value and the definition of "green" change.
 */
export const loopTypes = pgTable('loop_types', {
  id: id(),
  templateName: text('template_name').notNull(), // Argo WorkflowTemplate metadata.name
  templateVersion: text('template_version').notNull(), // OPEN: tag, git SHA, …
  // Iteration cap. OPEN: unit — review rounds vs. coder passes incl. failed checks
  maxIterations: integer('max_iterations').notNull(),
  greenDefinition: text('green_definition'), // OPEN: a reference to what — gate config, skill?
  createdAt: createdAt(),
}, table => [
  unique('loop_types_template_unique').on(table.templateName, table.templateVersion),
])
```

### Runs

```ts
/**
 * One workflow run: issue → PR. Our own UUID, independent of Argo.
 * created_at never changes — ADR-003's HMAC checks expiry against it, if HMAC stays.
 */
export const runs = pgTable('runs', {
  id: id(),
  triggerId: uuid('trigger_id').notNull().unique().references(() => triggers.id, { onDelete: 'restrict' }),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'restrict' }),
  issueNumber: integer('issue_number').notNull(),
  loopTypeId: uuid('loop_type_id').notNull().references(() => loopTypes.id, { onDelete: 'restrict' }),
  maxIterations: integer('max_iterations').notNull(), // snapshot of loop_types.max_iterations at creation
  // OPEN: resume after escalation — new run pointing here, or sub-run of the same run (ADR-009)
  parentRunId: uuid('parent_run_id').references((): AnyPgColumn => runs.id, { onDelete: 'restrict' }),
  status: text('status', { enum: RUN_STATUSES }).notNull().default('pending'),
  outcome: text('outcome', { enum: RUN_OUTCOMES }), // null until finished
  branch: text('branch'), // per run — 04: hardcoded branch names collide
  prNumber: integer('pr_number'),
  headSha: text('head_sha'),
  // Stored references, not FKs: Argo has its own database and stays swappable (ADR-005)
  argoWorkflowName: text('argo_workflow_name'),
  argoWorkflowUid: uuid('argo_workflow_uid'), // Kubernetes UIDs are UUIDs. Null until submitted (target flow)
  createdAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, table => [
  // One active run per issue. OPEN: which statuses are active — does waiting-on-human ("pending") count?
  uniqueIndex('runs_one_active_per_issue')
    .on(table.repositoryId, table.issueNumber)
    .where(sql`${table.status} in ('pending', 'running')`),
  check('runs_outcome_when_finished', sql`(${table.status} = 'finished') = (${table.outcome} is not null)`),
])
```

Generated SQL for the index:

```sql
CREATE UNIQUE INDEX "runs_one_active_per_issue" ON "runs" USING btree ("repository_id","issue_number") WHERE "runs"."status" in ('pending', 'running');
```

### Steps and attempts

- **Step** = our iteration: "implement · 2" in the [loop diagram](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/04-workflow.md). Bounded by the iteration cap.
- **Step attempt** = one pod. Argo's `retryStrategy` re-runs a step in a new pod.
- Argo's default `retryPolicy` is `OnFailure`: "Retry steps whose main container is marked as failed in Kubernetes" ([retries](https://argo-workflows.readthedocs.io/en/latest/retries/)). A non-zero goose exit for a domain reason is retried too, and every retry pays for model calls again.
- Agents report per pod. Without attempts, reports from retries overwrite or mix, and token totals come out wrong.
- Argo exposes the retry number to container templates as `{{retries}}` ([variables](https://argo-workflows.readthedocs.io/en/latest/variables/)).

```ts
/**
 * One logical node of the unrolled DAG, e.g. "implement · 2". Iterations are steps.
 * Timestamps derive from attempts: first attempt started → accepted attempt finished.
 */
export const steps = pgTable('steps', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  stepKey: text('step_key').notNull(), // e.g. P1, C1, C2. OPEN: assigned by template or service
  role: text('role', { enum: ROLES }).notNull(),
  iteration: integer('iteration').notNull(), // X of runs.max_iterations
  retryLimit: integer('retry_limit').notNull(), // snapshot of retryStrategy.limit
  outcome: text('outcome'), // OPEN: outcome set not finalized
  // OPEN: which attempt downstream steps read when a producer was retried
  acceptedAttemptId: uuid('accepted_attempt_id').references((): AnyPgColumn => stepAttempts.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
}, table => [
  unique('steps_run_step_key_unique').on(table.runId, table.stepKey),
])

/**
 * One pod. Argo retryStrategy re-runs a step in a new pod; each reports and costs separately.
 */
export const stepAttempts = pgTable('step_attempts', {
  id: id(),
  stepId: uuid('step_id').notNull().references(() => steps.id, { onDelete: 'cascade' }),
  attemptNumber: integer('attempt_number').notNull(), // Argo {{retries}}. OPEN: 0- or 1-based — check
  // Stored references, not FKs: pods are ephemeral
  argoNodeId: text('argo_node_id'),
  podName: text('pod_name'),
  podUid: uuid('pod_uid'),
  image: text('image'), // reference incl. digest
  provider: text('provider'), // GOOSE_PROVIDER
  model: text('model'), // GOOSE_MODEL
  deadlineSeconds: integer('deadline_seconds'), // snapshot of activeDeadlineSeconds
  status: text('status', { enum: ATTEMPT_STATUSES }).notNull().default('queued'),
  outcome: text('outcome'), // OPEN: outcome set not finalized
  exitCode: integer('exit_code'), // recorded, not a success signal (ADR-009)
  // queued → started = cold start (ADR-004). OPEN: source — agents can't report before the pod runs
  queuedAt: timestamp('queued_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: createdAt(),
}, table => [
  unique('step_attempts_step_attempt_unique').on(table.stepId, table.attemptNumber),
])

/**
 * Append-only status reports from agents. Never updated.
 * A killed pod can't report: its last row stays its status until stale detection exists.
 */
export const stepEvents = pgTable('step_events', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ATTEMPT_STATUSES }).notNull(),
  message: text('message'),
  // Server clock. A pod-supplied timestamp would be untrusted input.
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Token usage and prices

```ts
/**
 * Price per model over time. Prices change; usage rows keep the price they were costed with.
 */
export const modelPrices = pgTable('model_prices', {
  id: id(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  currency: text('currency').notNull().default('USD'), // as configured — USD for now
  inputPerMillion: numeric('input_per_million', { precision: 12, scale: 6 }).notNull(),
  outputPerMillion: numeric('output_per_million', { precision: 12, scale: 6 }).notNull(),
  cachedInputPerMillion: numeric('cached_input_per_million', { precision: 12, scale: 6 }), // OPEN: needed?
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, table => [
  unique('model_prices_model_effective_unique').on(table.provider, table.model, table.effectiveFrom),
])

/**
 * Raw token counts per attempt — feedback for the human, not governance.
 * Spend limits are enforced at the AI gateway. Reported by an untrusted pod: a display figure.
 * UNVERIFIED: what goose reports in headless runs.
 */
export const tokenUsage = pgTable('token_usage', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cachedInputTokens: integer('cached_input_tokens'), // OPEN: reported at all?
  // Costed at insert. Null when no price row matches — raw counts stay authoritative.
  priceId: uuid('price_id').references(() => modelPrices.id, { onDelete: 'restrict' }),
  cost: numeric('cost', { precision: 12, scale: 6 }), // in model_prices.currency
  createdAt: createdAt(),
})
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
  // SAS is issued before the bytes exist: reserved → uploaded is the one state change.
  // OPEN: allow that update, or record uploads as separate insert-only rows
  state: text('state', { enum: ['reserved', 'uploaded'] }).notNull().default('reserved'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }), // known after upload
  sha256: text('sha256'), // known after upload
  createdAt: createdAt(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
}, table => [
  unique('artifacts_producer_name_unique').on(table.producerAttemptId, table.name),
])
```

### Gates and escalations

```ts
/**
 * Gate results per attempt. Code gates (tests, lint) and judgment gates
 * (typed answers, e.g. a probability — ADR-009).
 */
export const gateResults = pgTable('gate_results', {
  id: id(),
  attemptId: uuid('attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  gate: text('gate').notNull(),
  kind: text('kind', { enum: ['code', 'judgment'] }).notNull(),
  passed: boolean('passed'),
  score: numeric('score'), // e.g. probability a condition holds
  createdAt: createdAt(),
})

/**
 * A run that hit its cap without green (ADR-009).
 * OPEN: resumedRunId duplicates runs.parent_run_id — keep one once resume is decided.
 */
export const escalations = pgTable('escalations', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(), // e.g. cap reached without green
  resolution: text('resolution'),
  resumedRunId: uuid('resumed_run_id').references(() => runs.id, { onDelete: 'set null' }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})
```

### Conditional on agent authentication

Exist only depending on HMAC vs. Kubernetes ServiceAccount tokens ([Open](#open)). Both come from the 2026-10-23 artifact service discussion — proposals, not accepted: artifact identity = run + producing step + producing attempt + name; caller is distinct from producer; workflows pass logical references, never Blob paths or SAS URLs.

```ts
/**
 * Exists if grants are persisted server-side. Caller ≠ producer: the coder (caller)
 * reads the planner's plan (target). Changing target or action must fail authorization.
 * OPEN: when grants are created relative to attempt creation.
 */
export const artifactGrants = pgTable('artifact_grants', {
  id: id(),
  callerAttemptId: uuid('caller_attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  targetProducerAttemptId: uuid('target_producer_attempt_id').notNull().references(() => stepAttempts.id, { onDelete: 'cascade' }),
  targetName: text('target_name').notNull(),
  action: text('action', { enum: ['create', 'read'] }).notNull(), // create-only: no update (ADR-005)
  createdAt: createdAt(),
}, table => [
  unique('artifact_grants_unique').on(table.callerAttemptId, table.targetProducerAttemptId, table.targetName, table.action),
])

/**
 * Exists if HMAC tokens are delivered as Kubernetes Secrets. The workflow service owns
 * cleanup when the run finishes, so it must keep the run ↔ Secret association.
 * Cleanup failures stay visible and retryable.
 */
export const credentialSecrets = pgTable('credential_secrets', {
  id: id(),
  runId: uuid('run_id').notNull().references(() => runs.id, { onDelete: 'restrict' }),
  attemptId: uuid('attempt_id').references(() => stepAttempts.id, { onDelete: 'restrict' }), // OPEN: one Secret per run or per attempt
  namespace: text('namespace').notNull().default('agents'),
  secretName: text('secret_name').notNull(),
  cleanupStatus: text('cleanup_status', { enum: ['pending', 'deleted', 'failed'] }).notNull().default('pending'),
  cleanupError: text('cleanup_error'),
  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  unique('credential_secrets_name_unique').on(table.namespace, table.secretName),
])
```

### Relations

Main paths only. `relationName` disambiguates `steps` ↔ `step_attempts`, which reference each other.

```ts
export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  project: one(projects, { fields: [repositories.projectId], references: [projects.id] }),
  runs: many(runs),
}))

export const runsRelations = relations(runs, ({ one, many }) => ({
  trigger: one(triggers, { fields: [runs.triggerId], references: [triggers.id] }),
  repository: one(repositories, { fields: [runs.repositoryId], references: [repositories.id] }),
  loopType: one(loopTypes, { fields: [runs.loopTypeId], references: [loopTypes.id] }),
  parentRun: one(runs, { fields: [runs.parentRunId], references: [runs.id], relationName: 'resume' }),
  steps: many(steps),
}))

export const stepsRelations = relations(steps, ({ one, many }) => ({
  run: one(runs, { fields: [steps.runId], references: [runs.id] }),
  attempts: many(stepAttempts, { relationName: 'attempts' }),
  acceptedAttempt: one(stepAttempts, { fields: [steps.acceptedAttemptId], references: [stepAttempts.id], relationName: 'accepted' }),
}))

export const stepAttemptsRelations = relations(stepAttempts, ({ one, many }) => ({
  step: one(steps, { fields: [stepAttempts.stepId], references: [steps.id], relationName: 'attempts' }),
  events: many(stepEvents),
  tokenUsage: many(tokenUsage),
  artifacts: many(artifacts),
}))
```

## Identifiers

**Own UUIDs** — primary keys for project, repository, run, step, attempt, artifact.

- The run UUID is also what ADR-003's HMAC token binds — if HMAC stays.
- **UUID version open.** PostgreSQL 17 has `gen_random_uuid()` (v4). `uuidv7()` (time-ordered) is built in only from **PostgreSQL 18** ([PG 18 UUID functions](https://www.postgresql.org/docs/18/functions-uuid.html)). Azure Flexible Server offers PostgreSQL 18 ([supported versions](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions)). Options: v4 in the DB, v7 generated in the app, or upgrade the server ([in-place major version upgrade](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-major-version-upgrade) exists; not evaluated).

**External IDs** — stored as values, never foreign keys:

| ID | Source | Notes |
|---|---|---|
| Delivery GUID | `X-GitHub-Delivery` header | unique constraint → idempotent webhook handling |
| Repository ID | GitHub numeric `id` | `full_name` changes on rename / transfer. **Unverified:** that the numeric ID is guaranteed stable. |
| Issue / PR number, commit SHA | GitHub | per repository |
| Workflow name + UID | Argo | `workflow.uid`; nullable until submitted (target flow) |
| Node ID | Argo | per attempt |
| Pod name + UID | Kubernetes | per attempt; Kubernetes UIDs are UUIDs |

## Timestamps

- `timestamptz` everywhere. PostgreSQL stores it internally in UTC and converts on output to the session `TimeZone` ([date/time types](https://www.postgresql.org/docs/17/datatype-datetime.html)). Set the service's session time zone to UTC.
- `created_at` defaults in the database and never changes. If HMAC stays, it is load-bearing: ADR-003 checks token expiry against run creation.
- **queued → started** on an attempt is the cold-start cost ADR-004 accepts. Agents can only report once their pod runs, so `queued_at` needs another source (Argo). Open.

## Caps

Different kinds, each stored where it applies, as a snapshot of the value in force when the run started. "X of Y" is derived per kind — Y on the owner, X on the counted row — never stored as a pair.

| Cap | Y stored on | X counted by | Source today |
|---|---|---|---|
| Iteration cap | run (from loop type) | step iteration n | 04 YAML `attempt < 2`; ADR-009 |
| Infrastructure retry limit | step | attempt no. | `retryStrategy: { limit: 2 }` |
| Time cap | attempt | started → finished | `activeDeadlineSeconds: 3600` |
| Spend | — | — | AI gateway, not this database |

What the iteration cap counts — review rounds, or every coder pass including failed checks — is deferred ([Open](#open)).

## Foreign keys vs. stored references

| Reference | FK? | Why |
|---|---|---|
| everything inside `workflow` — see `.references()` in [Schema](#schema--proposal) | yes | same database; `onDelete` per FK is a proposal |
| run → Argo workflow | no | Argo's own database; archive optional; Argo stays swappable ([ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md) trade-off) |
| attempt → Argo node, pod | no | pods are ephemeral |
| artifact → Blob | no | object storage; path by artifact-service convention |
| repository, issue, PR, commit → GitHub | no | external |

PostgreSQL cannot reference across databases, so anything in `argo` is a stored value.

## Run creation

- **Target:** webhook → workflow service creates the run → submits to Argo ([ADR-004](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/004-orchestration-argo-workflows.md)). Argo workflow UID filled in after submit.
- **POC proposal** (2026-10-23 artifact service discussion): Argo CLI submit → a registration call from Argo → workflow service creates the run and returns the run UUID **before any model-driven pod starts**. Temporary and unauthenticated; replaced by authenticated ingress. Argo workflow UID known at creation.
- Either way: `triggers.source` distinguishes the paths; `runs.argo_workflow_uid` is nullable.

## Crash capture — later

Not needed for the first POC stage.

- goose has lifecycle hooks: `SessionStart`, `SessionEnd`, `Stop`, `PostToolUseFailure` and others; a hook gets JSON on stdin with `session_id` and tool fields ([goose hooks](https://goose-docs.ai/blog/2026/05/14/goose-hooks)). **Unverified:** whether hooks fire in headless `goose run`, and whether any event carries token usage.
- Hooks run inside the goose process. An OOM kill (SIGKILL) ends the process with no chance to report. Kills need an observer outside the pod.
- Candidates: Argo [exit handlers](https://argo-workflows.readthedocs.io/en/latest/walk-through/exit-handlers/) and [lifecycle hooks](https://argo-workflows.readthedocs.io/en/latest/lifecyclehook/). Not evaluated.
- Until then, a crashed attempt stays in its last reported status.

## Open

- [ ] **States.** Go through all run, step and attempt states. A run waiting on a human is "pending" — decide whether pending counts as active for one-active-run-per-issue.
- [ ] **Iteration cap unit:** review rounds vs. coder passes including failed checks. Needs investigation.
- [ ] **Raw webhook payload vs. extracted fields.** Measure payload size once built, then compare.
- [ ] **Resume after escalation:** new run with `parent_run_id`, or sub-run under the same run (ADR-009 allows either).
- [ ] **Project ↔ repository:** start 1:1 or 1:N. Projects with submodules are 1:N. The broker scopes each token to one repository, so one run → one repository either way.
- [ ] **Agent authentication:** HMAC (documented) vs. Kubernetes ServiceAccount tokens (under evaluation, pending the GitHub broker). Decides whether `artifact_grants` and `credential_secrets` exist. Authorization stays in the artifact service either way.
- [ ] **UUID version:** v4 vs. v7; PostgreSQL 17 vs. 18.
- [ ] **Accepted attempt:** when a producer is retried, which attempt's artifact downstream steps read.
- [ ] **`queued_at` source** for cold-start measurement.
- [ ] **Step outcome set** — not finalized.
- [ ] **Pricing table upkeep:** who enters prices, and whether the gateway reports cost directly.
- [ ] **Stale attempts:** how a crashed attempt is detected.
- [ ] **Database-enforced statuses:** `text` + `{ enum }` generates no `CHECK`. Add `check()` per status column, a lookup table, or rely on the application.
- [ ] **Roles:** ADR-012's planner / coder / reviewer / open-PR vs. ADR-014's architect + coder committing roles.
- [ ] **`{{retries}}` numbering:** 0- or 1-based — decides `attempt_number`.
- [ ] **`onDelete` policies:** `restrict` on references to projects, repositories, triggers, loop types and producing attempts; `cascade` on child rows. Do runs ever get deleted?

## Decision log

| Date | Decision | Reasoning |
|---|---|---|
| 2026-10-25 | Schema proposal as Drizzle code blocks, one per entity group | Easier to read and comment on in a PR than tables. Conventions follow tally-split-ai; UUID primary keys instead of text IDs. Type-checked and SQL generated with drizzle-kit, no database. |
| 2026-10-25 | Started schema brainstorm in platform-services | Workflow service owns the database (ADR-005); the agent implementing it works in this repo. Argo-side contract in the workflows repo. |
| 2026-10-25 | Artifact metadata in the database | Architect. |
| 2026-10-25 | Own run UUID | Target trigger is the workflow service; POC Argo CLI trigger must not dictate the ID. |
| 2026-10-25 | One active run per issue | Concurrent runs on one issue are waste. |
| 2026-10-25 | Store raw token counts; price if cheap; USD | Feedback to the human, not governance. Gateway enforces limits. |
| 2026-10-25 | Projects table with related repositories | Avoid repeated name columns; room for UI metadata. Cardinality open. |
| 2026-10-25 | Step and step attempt are separate | Iterations are domain logic; Argo retries are new pods that report and cost separately. |
| 2026-10-25 | Agents report step status | Crash capture deferred. |
| 2026-10-25 | Caps are distinct kinds | Iteration, retry, time and spend caps count different things. |

### Accepted trade-offs

| Trade-off | Notes |
|---|---|
| Argo IDs are not foreign keys | No referential integrity to Argo; keeps Argo swappable. |
| Self-reported status | A crashed pod can't report; stale attempts are visible only once detection exists. |
| Token usage reported by untrusted pods | Display figure, not a control. |
