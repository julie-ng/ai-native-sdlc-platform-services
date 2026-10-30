# Server instructions

Applies to `server/**`, in addition to the root instructions. For schema or migration work, also read [db/AGENTS.md](./db/AGENTS.md).

## REST routes and boundaries

- Put routes in `server/api/` with HTTP method suffixes, e.g. `resources/index.post.ts` or `resources/[id].get.ts`. Nuxt adds `/api`.
- `server/routes/` serves paths outside `/api`. It holds only the public `GET /` service identifier (`index.get.ts`); do not add API behavior there.
- Use `defineEventHandler` for HTTP parsing, authorization, status codes, and response shaping. Extract reusable behavior into server utilities.
- Use `createError()` for HTTP failures; translate ordinary utility errors at the HTTP boundary. Standalone scripts must not depend on Nuxt globals.
- Auto-import Nuxt helpers only; explicitly import project dependencies unless their auto-imports are configured. Do not invent database or guard helpers.
- Never import Vue app code. Read private configuration with `useRuntimeConfig(event)`.

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

- Follow the [API overview](../docs/api/README.md), [implementation contract](../docs/api/implementation.md), and [server ports](./utils/artifact/ports.ts).
- Call `requireCallerContext(event)` explicitly and first in every artifact route; the guard establishes `event.context.caller`. Do not move this into global middleware. Never replace it with HTTP claims or a workflow-step lookup. Fixed caller contexts belong only in tests.
- Logical steps own artifacts. Reuse IDs/blobs across retries; do not add attempt history or overlapping-writer coordination.
- Keep discovery/metadata separate from SAS issuance. List readable records only; transfer bytes directly between caller and cloud storage.
- Each permitted POST issues a fresh SAS for the same artifact. Never persist or log SAS URLs.

## Verification

- Test success, malformed input, missing resources, authentication/authorization failures, and response-field permissions.
- Unit-test implemented policy/context functions; test HTTP sequencing against actual handlers. Use real database/storage integration tests for persistence and transfer claims.
- Do not add placeholder endpoints, permissive guards, or simulated services merely to satisfy tests.

Reference: [Nuxt server directory](https://nuxt.com/docs/4.x/directory-structure/server). Check installed Nuxt/H3 versions before adapting examples.
