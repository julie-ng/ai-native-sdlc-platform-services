---
name: add-api-endpoint
description: Add or extend a REST API route or HTTP method under server/api/ in this Nuxt TypeScript application, including its contract, validation, authorization, and verification.
---

# Add an API endpoint

Read the repository's [root instructions](../../../AGENTS.md), [server instructions](../../../server/AGENTS.md), and [current architecture/open decisions](../../../docs/architecture.md). These files own the conventions; this skill describes the workflow.

1. Establish the contract: resource, method, path, caller, input, response fields/status codes, and expected failures. Inspect existing routes first. If this is the first route, resolve only the missing infrastructure decisions it actually needs; do not invent an auth provider, database engine, or response envelope.
2. Identify needed runtime schemas and guards. Read [shared instructions](../../../shared/AGENTS.md) for shared validation and [database instructions](../../../server/db/AGENTS.md) if persistence changes. Confirm installed dependencies and actual helper exports before using them.
3. Create the method-suffixed `.ts` handler under `server/api/`. Keep authorization, validation, and response shaping visible. Extend existing helpers where suitable; introduce focused helpers where needed instead of referencing nonexistent globals.
4. For a mutation, check allowed update fields, ownership of linked resources, the timestamp update mechanism, and the caller's permission to read any returned fields. Include migrations only when persistence changes require them.
5. Add behavioral coverage for the contract and relevant failures from the server instructions. If this is the first endpoint, configure the appropriate test runner and commands with it; do not claim a build proves request behavior.
6. Document the API contract and any newly agreed infrastructure decisions. Update commands/current state when capabilities become implemented. Run the relevant behavioral checks and `npm run verify`; report results and any remaining limitations.

Do not add placeholder business resources, permissive guards, provider integrations, or UI as side effects of using this skill. The explicit task defines the scope.
