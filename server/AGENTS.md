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
- Prefer explicit guard utilities for caller context and resource permissions. Authentication may run in upstream middleware when the contract says so. Validate input and derive server-owned visibility before database queries; constrain lookups to that scope, then check the requested action before returning data, mutating or issuing a capability.
- Guards inspect or extend typed `event.context` and throw on failure; callers read established context instead of depending on guard return values.
- Require authorization for the specific resource and any newly linked resource. Knowing an ID or being authenticated is not sufficient authorization.
- Validate request bodies, router parameters, and query parameters with runtime schemas before using them. Type annotations and assertions do not validate input.
- Follow [shared schema conventions](../shared/AGENTS.md). Use Nuxt/H3 validated request helpers with the chosen library; do not duplicate field-by-field validation across handlers.
- Return HTTP 400 with structured field errors for invalid input. Keep the error contract consistent and avoid exposing internal errors or secrets.
- For resource-level authorization, default to HTTP 404 when a resource is missing or the caller has no effective access, regardless of whether it exists elsewhere. Use the same error shape/message for hidden and missing resources.
  - Return HTTP 403 only after finding an existing resource within the caller's scope for some granted action, when the requested action is not permitted. A failed action check alone is not enough to choose 403.
  - Where permissions are action-scoped, derive visibility from the union of effective grants. Do not use an unrestricted existence lookup to distinguish 403 from 404, and do not return stored fields with a permission error.

## Responses and data ownership

- Define each route's method, input, output, error shape, and status codes before implementation. Keep the response scoped to its domain or owned aggregate.
- Do not add unrelated joins merely to serve one UI view. Include relationship IDs where appropriate; aggregate reads are valid when the API owns that aggregate.
- Select response fields deliberately. A write permission does not imply read permission: for a write-only caller, return an acknowledgment or empty response, not the updated row. Other callers may receive a documented representation if authorized to read it.
- Keep session data to identity and authorization scope; retrieve domain data separately. Construct session shape through a single helper when sessions are introduced.

## Artifact POC handoff

- Before artifact implementation, read the [plan and ontology](../docs/plans/artifact-service.md), [API overview](../docs/api/README.md) and [implementation contract](../docs/api/implementation.md). Use the linked OpenAPI and TypeScript ports for exact shapes/signatures. Architect-approved refinements supersede the pinned plans' conflicting attempt-specific/create-only requirements; remaining proposals retain their labels.
- Follow the airport model: trusted middleware supplies `event.context.caller`; service code owns the artifact access list. Never accept replacement roles, grants or producer identities from HTTP input. The initial service consumes complete trusted context without a workflow-step lookup dependency. Authentication/context construction is deferred; HMAC versus Kubernetes ServiceAccount authentication is undecided. Inject fixed contexts only in tests; missing or malformed required context fails closed as specified by the contract.
- The logical step owns the artifact. Repeated writes and later executions of the same step reuse its artifact ID/blob; the planner may create/update its own plan under policy. Another step does not inherit that access. Do not add artifact attempt tracking or revision history. The initial POC has one upload capability (own-plan create/overwrite); create-only producers and upload-mode selection are deferred.
- Keep metadata/discovery separate from SAS issuance; transfer bytes directly between caller and cloud storage. Discovery returns readable records only, including an empty list when there are no read grants. Unknown tasks get no effective grants; resource requests default to 404. A write-only producer requesting an existing own artifact's metadata/download receives 403.
- Assume one active writer per step and consumption after production. This is a POC operating assumption, not an enforced concurrency guarantee; do not add overlapping-writer coordination to this slice.
- Treat each permitted POST as fresh SAS issuance for the same artifact; do not look up old URLs or introduce renewal state. Never persist or log SAS URLs. Follow the linked contract for first-write descriptive metadata and content-type consistency.
- Keep schemas/examples aligned with `npm run test:contract` and ports with `npm run typecheck`. Unit-test pure policy/context functions without a server; test actual service sequencing/HTTP behavior when implemented. Do not reconstruct an absent service in tests or claim signing order from an untouched spy. Database tests and real Blob handoff tests provide their own evidence; mock URLs or a successful build do not prove cloud transfer or permission enforcement.

## Verification

- Cover the success contract, malformed input, missing resources, unauthenticated and unauthorized access where applicable, and response-field permissions. Include a regression check for deliberate security omissions.
- Run `npm run test:unit` for offline native Node tests and `npm run typecheck` for Nuxt plus standalone test/support types. HTTP behavior needs separate tests when routes are introduced.
- Do not create placeholder endpoints, permissive guards, or invented database helpers just to satisfy an example.

Reference: [Nuxt 4 server documentation](https://nuxt.com/docs/4.x/directory-structure/server). Check the installed Nuxt/H3 versions before adapting examples.
