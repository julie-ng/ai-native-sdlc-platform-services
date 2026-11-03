# Agent instructions

Shared instructions for every coding agent working in this repository.

## Host environment

- Do not commit or push – all credentials are on a physical YubiKey that agents have zero access to. Just work interactively with Julie (human).

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

- When adding a REST route or HTTP method, read the [add-api-endpoint skill](./.agents/skills/add-api-endpoint/SKILL.md). Read it directly if your client does not discover skills.

## Commands and completion

Use Node.js 24 (see [.node-version](./.node-version)) and npm with the committed lockfile.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies; also runs Nuxt preparation |
| `npm run dev` | Start local development |
| `npm ci --prefix docs-site` | Install the documentation site's locked dependencies (after the root `npm ci`) |
| `npm run docs:dev` | Preview the documentation site on port 4000, regenerating on source changes |
| `npm run docs:check` | Fail on undocumented exports or broken `{@link}`s in the JSDoc scope |
| `npm run docs:build` | Run `docs:check`, then build the static documentation site into `docs-site/dist/` |
| `npm run check:guidance` | Check repository guidance links and portable skill metadata |
| `npm run check:artifact-contract` | Alias for test:contract |
| `npm run generate:artifact-openapi` | Generate OpenAPI from Zod schemas and TypeScript HTTP definitions |
| `npm run lint` | Check JavaScript, TypeScript, and Vue with ESLint; warnings fail |
| `npm run lint:fix` | Apply available ESLint fixes |
| `npm run build` | Build the application |
| `npm run test:contract` | Check generated OpenAPI freshness/validity and documentation examples |
| `npm run db:up` / `npm run db:down` | Start/discard disposable PostgreSQL 17 in Docker |
| `npm run test:db` | Run repository integration tests against that database (not part of `verify`) |
| `npm run db:generate` / `npm run db:migrate` | Generate a migration from `server/db/schema.ts` / apply to `NUXT_DATABASE_URL` |
| `npm run test:unit` | Run offline Vitest unit tests |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run typecheck` | Check Nuxt application and standalone unit/support TypeScript |
| `npm run verify` | Run lint, guidance/contract checks, unit tests, typechecking and build |
| `npm run preview` | Preview an existing production build |

- For documentation-only changes, run `npm run check:guidance` and `git diff --check`. For application or configuration changes, run `npm run verify` plus relevant behavioral checks.
- `npm run typecheck` uses `nuxt typecheck` and a strict standalone TypeScript project for tests/support. `npm run test:unit` and `npm run test:contract` run [Vitest](https://vitest.dev/) with one `vitest.config.ts`; each test file is isolated, so run only the affected files with `npx vitest run <path>`. Keep tests independent and avoid shared environment mutations. ESLint and the build are not substitutes for these checks.
- Unit tests belong beside their source (`name.utils.test.ts`) and import `test`, `expect` and other helpers explicitly from `vitest`; contract/export tests belong in `tests/contract/`; database integration tests belong in `tests/integration/`. Verify meaningful behavior, failure paths, and authorization constraints.

## Code conventions

- Write `.ts` modules and `<script setup lang="ts">` for Vue logic. Infer types where clear; use `unknown` and narrow it for untrusted values. TypeScript types do not validate HTTP input at runtime.
- No semicolons; single quotes; trailing commas in multiline lists/objects; brace every `if`/`else`. Keep ternaries readable.
- Prefer factories and composables for complex stateful objects. Keep helpers focused and avoid abstractions without a concrete use.
- Utilities use `name.utils.ts`; composables use `useName.ts`; stores use `name.store.ts`; reusable Vue components use PascalCase filenames.
- Put frontend-only helpers in `app/utils/`, backend-only helpers in `server/utils/`, and environment-independent helpers in `shared/utils/`. Add directories when needed.
- Within Nuxt, prefer `#shared/` and `#server/` for cross-boundary imports, and `~/` for app imports. Do not introduce `~~/` imports. Standalone scripts must use imports their actual runtime can resolve.
- Keep secrets and provider SDK credentials server-side. Private runtime configuration stays outside `runtimeConfig.public`.
- Document `server/utils/` and `server/db/` with JSDoc (`/** */`) so the server architecture can be reviewed as API documentation: an `@module` overview per file and a summary on every exported function, type, constant and port, with `@param`, `@returns` and `@throws` where they add information. Do not repeat TypeScript types in tags; state intent, constraints and failure behavior rather than restating the code. Do not add JSDoc to `shared/` Zod schemas and inferred types (the schemas and generated OpenAPI are the documentation) or to route handlers (HTTP behavior is documented in [docs/api](./docs/api/README.md)); keep their short intent comments. Update JSDoc with the code, and run `npm run docs:check` after changing exports or JSDoc.

## Knowledge and collaboration

- Record accepted decisions in the dated decision log in [architecture and decisions](./docs/architecture.md), including reasoning and tradeoffs; update the current-state description when implementation changes.
- Batch genuine open decisions in plain prose rather than multiple-choice forms.
- Use available documentation tools when useful, with official documentation as a fallback. Do not require a named MCP server or personal skill for routine project work.
- Reserve `IMPORTANT` callouts for load-bearing intent.

## Code Review Rules

- Flag missing runtime validation, missing resource-level authorization, and mutation responses that disclose data beyond the caller's read permissions.
- Flag server code imported into the client, secrets placed in public configuration, and undocumented assumptions about unimplemented services.
- Check that code, commands, documentation, and accepted decisions agree. Formatting belongs in automated tooling once configured.

## Shared instructions

Read and follow these alongside this repo’s project-specific instructions. Explicit project-specific exceptions override shared defaults; otherwise both apply.

- [Working practices](./.agents/shared/working-practices.md)
- [Communication and writing](./.agents/shared/communication.md)
- [Cross-session memory](./.agents/shared/memory.md)
- [Git & GitHub workflow](./.agents/shared/github-workflow.md)
