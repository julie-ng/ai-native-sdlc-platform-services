# Agent instructions

Shared instructions for every coding agent working in this repository.

## Project and reading order

- Nuxt 4 application for RESTful platform APIs. TypeScript is the default; UI work follows the initial release.
- Read [README.md](./README.md) and [architecture and decisions](./docs/architecture.md) before proposing architecture or adding dependencies. That document distinguishes installed capabilities, agreed choices, and open decisions.
- Before changing an area, explicitly read the applicable instructions below, including when your session started at the repository root. Do not assume nested files or Markdown links were automatically loaded.

| Work | Instructions |
| --- | --- |
| Server routes and utilities | [server/AGENTS.md](./server/AGENTS.md) |
| Database schema and migrations | Server instructions, then [server/db/AGENTS.md](./server/db/AGENTS.md) |
| Vue application and future UI | [app/AGENTS.md](./app/AGENTS.md) |
| Shared schemas, types, constants, utilities | [shared/AGENTS.md](./shared/AGENTS.md) |
| Branches, credentials, commits, delivery | [Git workflow](./docs/git-workflow.md) |

- When adding a REST route or HTTP method, read the [add-api-endpoint skill](./.agents/skills/add-api-endpoint/SKILL.md). Read it directly if your client does not discover skills.
- Keep broadly applicable rules here and area-specific rules in nested `AGENTS.md` files. Skills describe procedures and reference those rules instead of duplicating them.

## Commands and completion

Use Node.js 24 (see [.node-version](./.node-version)) and npm with the committed lockfile.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies; also runs Nuxt preparation |
| `npm run dev` | Start local development |
| `npm run check:guidance` | Check repository guidance links and portable skill metadata |
| `npm run check:artifact-contract` | Validate artifact OpenAPI/examples and typecheck design ports |
| `npm run generate:artifact-schemas` | Refresh design schema constants from OpenAPI |
| `npm run lint` | Check JavaScript, TypeScript, and Vue with ESLint; warnings fail |
| `npm run lint:fix` | Apply available ESLint fixes |
| `npm run build` | Build the application |
| `npm run verify` | Run lint, guidance and artifact contract checks, and the build |
| `npm run preview` | Preview an existing production build |

- For documentation-only changes, run `npm run check:guidance` and `git diff --check`. For application or configuration changes, run `npm run verify` plus relevant behavioral checks.
- No application typecheck or application test runner is configured yet; the artifact contract command checks design ports only. ESLint and the build are not substitutes for typechecking or behavioral tests. Introduce appropriate tooling alongside the first implementation that needs it, and update this table.
- Unit tests belong beside their source (`name.utils.test.ts`); integration tests belong in `tests/integration/` when introduced. Verify meaningful behavior, failure paths, and authorization constraints.
- Completion means the requested behavior or documentation is implemented, applicable checks pass, and affected docs reflect the result. Report unavailable checks and remaining limitations plainly.

## Code conventions

- Write `.ts` modules and `<script setup lang="ts">` for Vue logic. Infer types where clear; use `unknown` and narrow it for untrusted values. TypeScript types do not validate HTTP input at runtime.
- No semicolons; single quotes; trailing commas in multiline lists/objects; brace every `if`/`else`. Keep ternaries readable.
- Prefer factories and composables for complex stateful objects. Keep helpers focused and avoid abstractions without a concrete use.
- Utilities use `name.utils.ts`; composables use `useName.ts`; stores use `name.store.ts`; reusable Vue components use PascalCase filenames.
- Put frontend-only helpers in `app/utils/`, backend-only helpers in `server/utils/`, and environment-independent helpers in `shared/utils/`. Add directories when needed.
- Within Nuxt, prefer `#shared/` and `#server/` for cross-boundary imports, and `~/` for app imports. Do not introduce `~~/` imports. Standalone scripts must use imports their actual runtime can resolve.
- Keep secrets and provider SDK credentials server-side. Private runtime configuration stays outside `runtimeConfig.public`.
- Comment non-obvious intent and deliberate omissions. Preserve useful comments and JSDoc during refactors; flag unclear or stale intent before removing it.

## Knowledge and collaboration

- Repository documentation is required context. Record accepted decisions in the dated decision log in [architecture and decisions](./docs/architecture.md), including reasoning and tradeoffs; update the current-state description when implementation changes. Flag disagreements between design docs and decision records rather than silently choosing one.
- Keep reusable, accepted implementation rules in the applicable `AGENTS.md`, including refinements agreed during review. Link to plans/contracts for full schemas, limits and interface signatures; do not promote open proposals into mandatory rules.
- Default to interactive collaboration with the human architect. An explicit task or GitHub issue defines the scope for independent work; ask when the intended direction is unclear rather than inventing a task or design decision.
- Follow the task's scope. Check the code and docs before asking; batch genuine open decisions in plain prose rather than multiple-choice forms. Flag adjacent problems without silently expanding the task.
- Verify technical claims against the installed code and current primary documentation. Mark proposals and unverified claims in the document itself. Do not turn an inherited choice into an accepted decision.
- Explain mechanisms rather than saying something is handled. Leave unknown table cells empty instead of guessing; identify secondary sources when their authority is not obvious.
- Use available documentation tools when useful, with official documentation as a fallback. Do not require a named MCP server or personal skill for routine project work.
- Write concise, scannable Markdown without preambles or repeated summaries. Keep tables succinct; link to external docs instead of restating them. No hard line breaks within paragraphs. Use GitHub callouts for facts that merit emphasis; reserve `IMPORTANT` for load-bearing intent. Put occasional reference material in `<details>`.
- Lead with the outcome or correction. Report failures with the actual output, unresolved issues, and anything left out with its reason. Keep current state distinct from future goals; a goal that is not yet implemented is work remaining, not a contradiction.

## Cross-session memory

- Personal memory is supplementary. Every task must be understandable from its explicit input and repository files, without another checkout, personal memory, or conversation history. Repository docs and decision records remain authoritative.
- If project Markdown memory is available, all harnesses must explicitly read its `MEMORY.md` index and task-relevant linked files; do not assume they were loaded automatically. In the configured dev container, locate the mounted Claude directory through the original workspace's local `.devcontainer/devcontainer.json`, then the project's `projects/<workspace-path-slug>/memory/` directory. Use that original workspace's memory directory in task worktrees.
- Keep reusable learnings and preferences in existing memory entries and maintain the index. Keep entries harness-agnostic unless the detail is specific to a harness; coordinate before editing shared memory. Verify remembered technical claims against repository files and current sources.
- If memory is missing or unreadable, report that limitation and continue with repository documentation.

## Git and security

- Work in an isolated worktree on your own `agent/` branch. Never edit, commit, push, or merge directly into `main` or another protected branch, or bypass branch protections.
- Use native `git` and the authenticated `gh` CLI for repository and GitHub operations. Codex must not use GitHub MCP tools or the GitHub connector; this restriction does not apply to other MCP tools or connectors.
- Follow the [Git workflow](./docs/git-workflow.md) before creating branches or commits. Keep credentials out of files, command output, logs, and commits.
- Instructions and command filters guide behavior; claim a security boundary only where OS-level controls enforce it. Name the mechanism and distinguish mitigations from guarantees. Session managers, dashboards, and worktree UIs provide convenience; do not credit them with isolation they do not enforce.

## Code Review Rules

- Flag missing runtime validation, missing resource-level authorization, and mutation responses that disclose data beyond the caller's read permissions.
- Flag server code imported into the client, secrets placed in public configuration, and undocumented assumptions about unimplemented services.
- Check that code, commands, documentation, and accepted decisions agree. Formatting belongs in automated tooling once configured.
