# Server instructions

Applies to `server/**`, in addition to the root instructions. For schema or migration work, also read [db/AGENTS.md](./db/AGENTS.md).

## REST routes and boundaries

- Write TypeScript routes under `server/api/` with explicit HTTP method suffixes: `resources/index.get.ts`, `resources/index.post.ts`, `resources/[id].get.ts`, `resources/[id].put.ts`, or `resources/[id].delete.ts`. Nuxt adds the `/api` prefix.
- Use `defineEventHandler` for handlers. Keep HTTP parsing, authorization, status codes, and response shaping here; extract reusable server behavior into focused utilities.
- Use `createError()` for HTTP failures. Server utilities outside the HTTP layer may throw ordinary errors for a handler to translate; standalone scripts must not depend on Nuxt globals.
- Nuxt-provided helpers may be auto-imported in server code. Explicitly import database schemas, ORM operators, and other project dependencies unless this repository actually configures their auto-imports. No `useDB()`, `guards`, or `schema` globals exist yet.
- Never import Vue app code into server code. Use private runtime configuration via `useRuntimeConfig(event)` for server secrets; never put them in `.public`.

## Guards and validation

- Establish whether an endpoint is public, user-authenticated, or service-authenticated as part of its contract. Do not invent an identity provider or assume a guard implementation exists.
- Prefer explicit guard utilities at the start of protected handlers over hidden route authorization in global middleware: authenticate, validate the resource identifier, then authorize access to that resource before database work.
- Guards inspect or extend typed `event.context` and throw on failure; callers read established context instead of depending on guard return values.
- Require authorization for the specific resource and any newly linked resource. Knowing an ID or being authenticated is not sufficient authorization.
- Validate request bodies, router parameters, and query parameters with runtime schemas before using them. Type annotations and assertions do not validate input.
- Follow [shared schema conventions](../shared/AGENTS.md). Use Nuxt/H3 validated request helpers with the chosen library; do not duplicate field-by-field validation across handlers.
- Return HTTP 400 with structured field errors for invalid input. Keep the error contract consistent and avoid exposing internal errors or secrets. Handle absent resources as 404.

## Responses and data ownership

- Define each route's method, input, output, error shape, and status codes before implementation. Keep the response scoped to its domain or owned aggregate.
- Do not add unrelated joins merely to serve one UI view. Include relationship IDs where appropriate; aggregate reads are valid when the API owns that aggregate.
- Select response fields deliberately. A write permission does not imply read permission: for a write-only caller, return an acknowledgment or empty response, not the updated row. Other callers may receive a documented representation if authorized to read it.
- Keep session data to identity and authorization scope; retrieve domain data separately. Construct session shape through a single helper when sessions are introduced.

## Verification

- Cover the success contract, malformed input, missing resources, unauthenticated and unauthorized access where applicable, and response-field permissions. Include a regression check for deliberate security omissions.
- No application test runner is installed yet. Add the needed test tooling with the first endpoint; document its command in the root instructions and README.
- Do not create placeholder endpoints, permissive guards, or invented database helpers just to satisfy an example.

Reference: [Nuxt 4 server documentation](https://nuxt.com/docs/4.x/directory-structure/server). Check the installed Nuxt/H3 versions before adapting examples.
