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

## Entities — proposal

| Entity | Key | Holds |
|---|---|---|
| `project` | UUID | name, description, UI metadata |
| `repository` | UUID; unique forge repo ID | `project_id` FK, `full_name` (mutable), forge numeric repo ID |
| `trigger` | UUID; unique GitHub delivery GUID when webhook | source (`webhook` \| `cli`), event, received_at, accepted / ignored + reason, `run_id` (nullable) |
| `loop_type` | name + version | cap values, definition of "green" (reference) |
| `run` | UUID | repository FK, issue number, loop type, cap snapshots, status, outcome, branch, PR number, head SHA, `parent_run_id` (nullable), Argo workflow name + UID |
| `step` | UUID; unique (run, step key) | one logical node of the unrolled DAG — role, iteration n, step key (e.g. `P1`, `C1`, `C2`), outcome |
| `step_attempt` | UUID; unique (step, attempt no.) | one pod — Argo retry number, Argo node ID, pod name + UID, image digest, provider / model, exit code, deadline snapshot, timestamps |
| `step_event` | append-only | status reports from agents, per attempt |
| `token_usage` | per attempt | provider, model, input / output / cached tokens, `cost_usd`, pricing FK |
| `pricing` | model + `effective_from` | USD per 1M input / output tokens |
| `artifact` | UUID; unique (run, producer step, producer attempt, name) | producer attempt FK, kind, content type, size, sha256, state, created / uploaded timestamps |
| `gate_result` | per attempt | gate name, kind (`code` \| `judgment`), result, score / probability |
| `escalation` | per run | reason (e.g. cap hit without green), opened / resolved, resolution, resumed run |

Depend on the authentication decision ([Open](#open)):

| Entity | Exists if | Holds |
|---|---|---|
| `artifact_grant` | grants are persisted server-side | caller attempt, target artifact, action (`create` \| `read`) |
| `credential_secret` | HMAC tokens are delivered as Kubernetes Secrets | run / step / attempt, Secret name, created, deleted, cleanup status — the workflow service owns cleanup and must keep this association |

Both come from the 2026-10-23 artifact service discussion: artifact identity = run + producing step + producing attempt + artifact name; caller step/attempt is distinct from producer; workflow passes logical references, never Blob paths or SAS URLs. Proposals, not accepted.

### Why step and step attempt

- **Step** = our iteration: "implement · 2" in the [loop diagram](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/04-workflow.md). Bounded by the iteration cap.
- **Step attempt** = one pod. Argo's `retryStrategy` re-runs a step in a new pod.
- Argo's default `retryPolicy` is `OnFailure`: "Retry steps whose main container is marked as failed in Kubernetes" ([retries](https://argo-workflows.readthedocs.io/en/latest/retries/)). A non-zero goose exit for a domain reason is retried too, and every retry pays for model calls again.
- Agents report per pod. Without attempts, reports from retries overwrite or mix, and token totals come out wrong.
- Argo exposes the retry number to container templates as `{{retries}}` ([variables](https://argo-workflows.readthedocs.io/en/latest/variables/)).

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
- Proposed per entity:

| Entity | Timestamps |
|---|---|
| run | created, started, finished |
| step | started (first attempt), finished (final attempt) — or derived from attempts |
| step attempt | queued, started, finished |
| artifact | created (reserved), uploaded |
| escalation | opened, resolved |

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
| step → run, attempt → step, artifact → attempt, run → repository → project | yes | same database |
| run → Argo workflow | no | Argo's own database; archive optional; Argo stays swappable ([ADR-005](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/005-state-and-artifacts.md) trade-off) |
| attempt → Argo node, pod | no | pods are ephemeral |
| artifact → Blob | no | object storage; path by artifact-service convention |
| repository, issue, PR, commit → GitHub | no | external |

PostgreSQL cannot reference across databases, so anything in `argo` is a stored value.

## Constraints — proposal

- **One active run per issue:** partial unique index on `(repository_id, issue_number)` restricted to active statuses. Which statuses count as active depends on the states to-do.
- **Statuses and outcomes:** `text` + check constraint or lookup table, not a PostgreSQL `ENUM` — "Existing values cannot be removed from an enum type, nor can the sort ordering of such values be changed, short of dropping and re-creating the enum type" ([enums](https://www.postgresql.org/docs/17/datatype-enum.html)). The outcome set is not finalized.
- **Create-only artifacts** (ADR-005): no content updates. The row still moves from reserved to uploaded, because the SAS URL is issued before the bytes exist. Open: allow that one state change, or record uploads as separate insert-only rows.

## Run creation

- **Target:** webhook → workflow service creates the run → submits to Argo ([ADR-004](https://github.com/julie-ng/ai-native-sdlc/blob/main/architecture/decisions/004-orchestration-argo-workflows.md)). Argo workflow UID filled in after submit.
- **POC proposal** (2026-10-23 artifact service discussion): Argo CLI submit → a registration call from Argo → workflow service creates the run and returns the run UUID **before any model-driven pod starts**. Temporary and unauthenticated; replaced by authenticated ingress. Argo workflow UID known at creation.
- Either way: `trigger.source` distinguishes the paths; Argo UID is nullable.

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
- [ ] **Agent authentication:** HMAC (documented) vs. Kubernetes ServiceAccount tokens (under evaluation, pending the GitHub broker). Decides whether `artifact_grant` and `credential_secret` exist. Authorization stays in the artifact service either way.
- [ ] **UUID version:** v4 vs. v7; PostgreSQL 17 vs. 18.
- [ ] **Accepted attempt:** when a producer is retried, which attempt's artifact downstream steps read.
- [ ] **`queued_at` source** for cold-start measurement.
- [ ] **Step outcome set** — not finalized.
- [ ] **Pricing table upkeep:** who enters prices, and whether the gateway reports cost directly.
- [ ] **Stale attempts:** how a crashed attempt is detected.

## Decision log

| Date | Decision | Reasoning |
|---|---|---|
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
