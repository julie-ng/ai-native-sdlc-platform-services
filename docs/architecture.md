# Architecture and decisions

## Current state

Platform Services is a Nuxt 4 application being developed to expose RESTful APIs. The initial release has no product UI.

- The application is currently the Nuxt minimal starter, including its welcome page. No product API endpoints, authentication, database schema, or migrations are implemented.
- Installed runtime dependencies include Nuxt/Vue, Zod, Drizzle/node-postgres and Azure Identity/Blob packages; [package.json](../package.json) and [package-lock.json](../package-lock.json) are authoritative for versions.
- Node.js 24 and npm are the development baseline. Nuxt project references are configured in [tsconfig.json](../tsconfig.json).
- Handwritten shared Zod schemas with inferred TypeScript types and runtime parsing are implemented, along with server context/policy/storage-key utilities and adapter interfaces. No service orchestration, routes, authentication, database schema/migrations or live storage adapters exist. Test-only fixtures and scoped fakes live under `tests/support/`.
- `npm run check:guidance` validates local Markdown file references and shared skill metadata. Nuxt ESLint checks JavaScript, TypeScript, and Vue with stylistic rules matching repository conventions. `npm run test:contract` validates generated OpenAPI, examples and fixture/scenario consistency; `check:artifact-contract` is a compatibility alias. Source interfaces are covered by `typecheck`. `npm run verify` runs lint, guidance checks, named contract tests, unit tests, typechecking and the Nuxt production build. `npm run test:unit` executes offline native Node tests; `npm run typecheck` covers Nuxt plus standalone tests/support and OpenAPI tooling. All are included in `verify`.
- GitHub Actions runs verification on pull requests targeting `main` and pushes to `main`, with manual dispatch available. A non-blocking npm audit includes development dependencies and summarizes high and critical findings in the job summary.

## Agreed direction

| Area | Decision | Implementation status |
| --- | --- | --- |
| First release | RESTful APIs, with UI deferred | Merged [artifact contract](./api/README.md); executable foundation implemented, routes pending |
| Language | TypeScript by default, including Vue script logic | Artifact types and pure utilities implemented; routes pending |
| Persistence | Drizzle is the ORM | Drizzle/node-postgres installed for PostgreSQL 17; schema, adapters and deployed database pending |
| UI | Pinia, Tailwind CSS, Nuxt UI | Deferred; not installed |
| Vue naming | PascalCase reusable component filenames | Applies to new components; Nuxt special filenames retain framework conventions |
| Agent guidance | Root and nested `AGENTS.md`; portable workflows under `.agents/skills/` | Shared guidance authored here; client adapters are managed separately |
| Durable context | Repository documentation is the minimum; personal memory is optional | No personal memory or other repository is required |

## Module boundaries

- `server/api/`: HTTP contracts and request handling; use explicit guards for protected operations.
- `server/utils/`: server-only utilities and integrations. `server/db/`: future Drizzle connection, schemas, and migrations.
- `shared/`: runtime schemas, types, constants, and pure helpers usable by server and client. No credentials, database clients, or Vue app dependencies.
- `app/`: Vue application and future UI. Pinia stores will own domain state and API interactions; pages/composables coordinate domains.
- Instructions explain conventions; they do not provision services or enforce runtime isolation.

## Open decisions

- Implement routes and real adapters against the merged [artifact contract](./api/README.md). The pinned [workflow reference](./plans/workflow-service.md) does not expand this slice.
- PostgreSQL 17/Drizzle/node-postgres, Zod validation, native Node tests and adapter interfaces follow the merged contract. Packages and pure utilities are installed; database schema, runtime clients and actual cloud transfer remain future work.
- Caller authentication and context construction are deferred: the initial service consumes trusted `event.context.caller` directly, with no workflow-step lookup dependency. Tests inject fixed server-owned context; production HMAC versus Kubernetes ServiceAccount authentication remains undecided. The artifact contract defines context shape and scoped resource access; real credentials and cluster context delivery remain deferred. Broader workflow/product choices remain outside this slice.

## Decision log

| Date / context | Decision and reason |
| --- | --- |
| 2026-10-25 / repository bootstrap | Start with TypeScript and REST APIs; defer UI implementation to keep the first release focused. Drizzle is the chosen ORM; Pinia, Tailwind, and Nuxt UI are reserved for later UI work. |
| 2026-10-25 / coding preferences | Use PascalCase components and adapt utility/composable conventions to TypeScript. Do not inherit another application's domain model, credentials, or service choices. |
| 2026-10-25 / agent portability | Author rules once in root/nested `AGENTS.md` and workflows in standard `SKILL.md` files. Client adapters are separate; repo docs must support fresh sessions independently of personal memory. |
| 2026-10-25 / continuous integration | Use the official Nuxt ESLint module with flat configuration and stylistic rules to check framework code and existing conventions together. Make lint, guidance checks, and a single production build required CI steps through `verify`. Keep npm audit informational, including high and critical advisory details in the job summary; audit failures do not block delivery. Defer tests and explicit typechecking until introduced separately. |
| 2026-10-26 / artifact review direction | Model the API as artifacts, with discovery and separate metadata/SAS reads. Apply the airport analogy: trusted middleware supplies caller context; the service owns access and an artifact ID cannot grant it. Authentication is outside this slice. Exact new contract choices remain labeled proposals for PR review. |
| 2026-10-26 / POC ownership simplification | Artifacts belong to a logical step, not an attempt. Repeated writes and retries use the same artifact ID/blob; planner may create/update its own plan. A different step cannot overwrite by default. Keep only latest completion size/hash/time, assume one active writer per step, and consume after production. Remove artifact attempt identity/history and overlapping-writer coordination; authentication remains upstream. These architect decisions supersede conflicting issue #5 requirements. |
| 2026-10-26 / inline artifact review | Default to 404 for missing artifacts or no effective access; return 403 only when an existing artifact is within some granted scope but the requested action is denied. Include `createdAt` and `updatedAt`; define explicit acknowledgment updates and keep SAS renewals/read-only operations timestamp-neutral. |
| 2026-10-26 / issue #6 implementation | Follow merged PR #12 as the authoritative contract, including its refined scope. Move schema-derived payload types to shared code and adapter ports to server code, preserving design entry points as re-exports. Use strict Ajv validation, native Node 24 offline tests and Nuxt/standalone typechecking; install the agreed database/Azure dependency baseline without constructing adapters. Authentication and token/assignment resolution remain excluded. |
| 2026-10-26 / interactive schema review | The architect chose handwritten Zod domain schemas with comments as the source of truth, superseding PR #12's OpenAPI-first/Ajv runtime tooling choice. Runtime validation uses strict Zod schemas and payload types use `z.infer`; OpenAPI is generated from those schemas plus handwritten TypeScript HTTP definitions. Use Zod's built-in OpenAPI 3.0 schema export without another generator dependency; retain Ajv/formats only as independent development-time checks of generated examples. Preserve the HTTP shapes, permissions, adapter signatures and fixtures. |
| 2026-10-26 / workflow lookup naming review | Name the step/run consistency lookup `WorkflowStepLookup`, its result `WorkflowStepReference`, its dependency `workflowSteps`, and its planned factory/module `createWorkflowStepLookup` / `workflow-step.utils.ts`. Avoid ambiguous identity terminology that suggests authentication or Azure workload identity. This naming decision is superseded by the subsequent trusted-context boundary decision. |
| 2026-10-26 / initial trusted-context boundary | Consume complete trusted caller context directly; defer workflow-step lookup and authentication/context construction until the HMAC versus Kubernetes ServiceAccount decision is made. Remove the unused lookup interface, reference type, factory plan, test fake and service dependency. Keep fail-closed context validation, binding/resource policy, test-only injected contexts and persistence FK/run-membership integrity. This supersedes the previous lookup handoff/naming requirement. |
| 2026-10-27 / human POC scope reduction | Defer unused create-only uploads. The only upload SAS permits planner creation/overwrite of its own bound plan; remove the mode selector, alternate schemas and create-only retry/completion branches. Other callers remain denied under resource policy. |
| 2026-10-27 / human SAS request simplification | Each permitted POST creates a fresh upload SAS for a stable step/name artifact. No URL renewal protocol, previous-URL lookup or SAS persistence. First descriptive metadata wins; repeated POSTs ignore omitted/changed kind/title/description without requiring replay. Keep content type consistent (409 on mismatch), timestamps and latest completion unchanged. This supersedes exact descriptive-metadata matching in PR #12. |
| 2026-10-27 / contract tooling separation | Build OpenAPI through a pure function with fresh per-call state. The explicit generation CLI only writes output; named native Node contract tests own freshness, deterministic generation and OpenAPI structure checks. Other legacy assertions migrate separately. |
| 2026-10-27 / contract test ownership | Replace the bespoke checker with named native Node contract suites for schema/export parity, fixture integrity and static scenario consistency. Direct schema unit tests do not import generated OpenAPI; fixture imports are data-only. Keep compiler checks independent and run contract tests once in verify. |
| 2026-10-27 / policy verification boundary | Remove test-only service sequencing/status calculations and untouched-signer assertions. Unit tests exercise implemented context/policy/storage-key behavior; contract tests check authored denial narratives. Runtime 403/404, discovery and signing-order verification remain work for actual service/HTTP tests. |
| 2026-10-27 / HTTP documentation ownership | Use compact operation definitions and shared response/header helpers under scripts/openapi/. HTTP documentation and contract tests consume the same authored examples JSON, including shared error examples. Generation imports data and schemas only; preserve HTTP semantics through this refactor. |
| 2026-10-27 / contract handoff cleanup | Remove the docs-only port compatibility re-export and use server/utils/artifact/ports.ts directly. Normal typechecking covers actual interfaces, tooling and all tests. Keep check:artifact-contract only as a documented test:contract alias; verify runs contract tests once. These human-approved scope/tooling refinements supersede conflicting preservation requirements in the original foundation handoff. |
| 2026-10-27 / workflow record terminology | Describe persisted workflow data as run/step tables, records and IDs, and their setup as schema migrations. Use caller context for request scope, keeping Azure workload identity terminology for the authentication feature. Name the planned seed helper seedWorkflowRunsAndSteps in workflow-records.ts, and test fixture collections workflowRecords/artifactRecords. This clarifies naming only; FK/run-membership requirements and the deferred caller lookup remain unchanged. |

## Contract review record

| Date / status | Proposal and review boundary |
| --- | --- |
| 2026-10-26 / issue #5, proposed | [Artifact baseline](./plans/artifact-service.md), [workflow reference](./plans/workflow-service.md) and [HTTP/adapter contract](./api/README.md) make the next implementation self-contained. [Choice sources](./api/README.md#choice-sources) label choices absent from the pinned plans. This branch proposes them for PR review; they are not recorded as previously accepted decisions. The revised resource contract follows architect feedback: server-owned discovery, metadata without implicit SAS issuance, middleware-supplied step context, and stable current artifacts with own-step planner updates. Installed checks establish schema/example/type consistency, not an implemented API or Azure handoff. |
