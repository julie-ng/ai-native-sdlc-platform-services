# Server instructions

Applies to `server/**`, in addition to the root instructions. For schema or migration work, also read [db/AGENTS.md](./db/AGENTS.md).

## REST routes and boundaries

- Put routes in `server/api/` with HTTP method suffixes, e.g. `resources/index.post.ts` or `resources/[id].get.ts`. Nuxt adds `/api`.
- `server/routes/` serves paths outside `/api`. It holds only the public `GET /` service identifier (`index.get.ts`) and the `GET /readyz` readiness probe; do not add API behavior there.
- Use `defineEventHandler` for HTTP parsing, authorization, status codes, and response shaping. Extract reusable behavior into server utilities.
- Use `createError()` for HTTP failures; translate ordinary utility errors at the HTTP boundary. Standalone scripts must not depend on Nuxt globals.
- Auto-import Nuxt helpers only; explicitly import project dependencies unless their auto-imports are configured. Do not invent database or guard helpers.
- Never import Vue app code. Read private configuration with `useRuntimeConfig(event)`.

## Logging and database

- Log with `useLogger(domain)` from `server/utils/use-logger.ts`, called inside handlers or callbacks, not at module top level. Never log request or response bodies, credential headers or full step context. Security events may include the user agent and validated run/step IDs with server-derived actions. SAS URLs in logs are an accepted risk; do not add code to strip them.
- The access log is the only global middleware. Readiness probes are excluded from it.
- Use the shared pool through `useDB()` (`server/db/use-db.ts`); do not create another pool in application code. `createDatabase()` is for tests and tooling that own their pool.

## Guards and validation

- Define each endpoint's authentication requirements and input/output/error contract before implementation.
- Guards establish typed `event.context` and throw on failure; callers read that context rather than guard return values.
- Validate bodies, route parameters, and queries with Zod and Nuxt/H3 validated request helpers. Follow [shared schema conventions](../shared/AGENTS.md).
- Derive visibility (any granted action) server-side. Check the requested action only for visible resources. Authorize both the target and newly linked resources.
- Return 400 with structured field errors for invalid input. Never expose internal errors or secrets.
- Return the same 404 for missing resources or no access; because the responses are identical, an unscoped lookup by ID is fine. Return 403 when the caller has some access but lacks the requested permission. Include no resource fields in either error.

## Responses and data ownership

- Keep responses within the API's domain or owned aggregate; avoid unrelated joins for individual UI views.
- Select public fields explicitly. Write-only callers receive an acknowledgment or empty response, not stored metadata.
- Keep sessions limited to identity and authorization scope; construct them through one helper and fetch domain data separately.

## Artifacts

- Follow the [API overview](../docs/api/README.md), [implementation contract](../docs/api/implementation.md), and [shared types](../shared/types/artifact.ts).
- Await `requireStepContext(event)` explicitly and first in every artifact route; the guard establishes `event.context.step`. Do not move this into global middleware. It authenticates HMAC credentials against stored run/step records; never substitute unverified HTTP claims. Fixed step contexts belong only in tests.
- Logical steps own artifacts. Reuse IDs/blobs across retries; do not add attempt history or overlapping-writer coordination.
- Keep discovery/metadata separate from SAS issuance. List readable records only; transfer bytes directly between caller and cloud storage.
- Each permitted POST issues a fresh SAS for the same artifact. Never persist SAS URLs.

## JSDoc

- Document every exported server utility/database function, type and constant, with an `@module` overview on its own line per file. Tests do not need JSDoc.
- ESLint enforces `jsdoc/require-param` and `jsdoc/require-returns` in `server/utils/**` and `server/db/**`, excluding tests and migrations. Explain parameter intent and returned results without repeating TypeScript types. Document `@throws` where it adds failure information; it is not lint-enforced. Run `npm run docs:check` after changing exports or JSDoc.

## Verification

- Test success, malformed input, missing resources, authentication/authorization failures, and response-field permissions.
- Follow the existing direct-function testing pattern: call utilities and guards with plain event objects, mock only their selected runtime dependencies, and assert results, context and thrown errors. Use the existing real PostgreSQL integration tests for database behavior.
- HTTP sequencing and live storage transfers are checked manually under the current setup. Report verification gaps; ask before adding an automated HTTP server harness or another testing layer. Do not treat a missing automated check as permission to introduce new infrastructure.
- Do not add placeholder endpoints, permissive guards, or simulated services merely to satisfy tests.

Reference: [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server). Check installed Nuxt/H3 versions before adapting examples.
