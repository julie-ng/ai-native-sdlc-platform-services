# Architecture and decisions

## Current state

Platform Services is a Nuxt 4 application being developed to expose RESTful APIs. The initial release has no product UI.

- The application is currently the Nuxt minimal starter, including its welcome page. No product API endpoints, authentication, database schema, or migrations are implemented.
- Installed runtime dependencies are Nuxt, Vue, and Vue Router; [package.json](../package.json) and [package-lock.json](../package-lock.json) are authoritative for versions.
- Node.js 24 and npm are the development baseline. Nuxt project references are configured in [tsconfig.json](../tsconfig.json).
- The `server/`, `server/db/`, and `shared/` directories currently contain guidance for future code. Their presence does not mean those capabilities are implemented.
- `npm run check:guidance` validates local Markdown file references and shared skill metadata. Nuxt ESLint checks JavaScript, TypeScript, and Vue with stylistic rules matching repository conventions. `npm run check:artifact-contract` validates the proposed OpenAPI and examples and typechecks the design ports. `npm run verify` runs lint, guidance checks, the artifact contract check, and the Nuxt production build. Application typechecking and behavioral tests are not configured yet.
- GitHub Actions runs verification on pull requests targeting `main` and pushes to `main`, with manual dispatch available. A non-blocking npm audit includes development dependencies and summarizes high and critical findings in the job summary.

## Agreed direction

| Area | Decision | Implementation status |
| --- | --- | --- |
| First release | RESTful APIs, with UI deferred | Artifact contract proposed in [issue #5 baseline](./api/README.md); no routes implemented |
| Language | TypeScript by default, including Vue script logic | Convention established; product code pending |
| Persistence | Drizzle is the ORM | Not installed; artifact slice targets PostgreSQL 17 with proposed node-postgres driver; no deployed database assumed |
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

- Review the [artifact contract proposal](./api/README.md), including its labeled new choices. The pinned [artifact](./plans/artifact-service.md) and [workflow](./plans/workflow-service.md) plans are reference material, not acceptance of their proposals.
- For the artifact slice, this PR proposes PostgreSQL 17/Drizzle/node-postgres, Ajv runtime validation, native Node tests and exact interfaces/fixtures. Only contract-check tooling is installed. No runtime/schema/client is provisioned by documentation.
- Caller authentication is outside this task: upstream middleware supplies trusted `event.context.caller`. The artifact contract defines its shape and scoped resource access; real credentials and cluster context delivery remain deferred. Broader workflow/product choices remain outside this slice.

## Decision log

| Date / context | Decision and reason |
| --- | --- |
| 2026-10-25 / repository bootstrap | Start with TypeScript and REST APIs; defer UI implementation to keep the first release focused. Drizzle is the chosen ORM; Pinia, Tailwind, and Nuxt UI are reserved for later UI work. |
| 2026-10-25 / coding preferences | Use PascalCase components and adapt utility/composable conventions to TypeScript. Do not inherit another application's domain model, credentials, or service choices. |
| 2026-10-25 / agent portability | Author rules once in root/nested `AGENTS.md` and workflows in standard `SKILL.md` files. Client adapters are separate; repo docs must support fresh sessions independently of personal memory. |
| 2026-10-25 / continuous integration | Use the official Nuxt ESLint module with flat configuration and stylistic rules to check framework code and existing conventions together. Make lint, guidance checks, and a single production build required CI steps through `verify`. Keep npm audit informational, including high and critical advisory details in the job summary; audit failures do not block delivery. Defer tests and explicit typechecking until introduced separately. |
| 2026-10-26 / artifact review direction | Model the API as artifacts, with discovery and separate metadata/SAS reads. Apply the airport analogy: trusted middleware supplies caller context; the service owns access and an artifact ID cannot grant it. Authentication is outside this slice. Exact new contract choices remain labeled proposals for PR review. |

## Contract review record

| Date / status | Proposal and review boundary |
| --- | --- |
| 2026-10-26 / issue #5, proposed | [Artifact baseline](./plans/artifact-service.md), [workflow reference](./plans/workflow-service.md) and [HTTP/adapter contract](./api/README.md) make the next implementation self-contained. [Provenance](./api/README.md#choice-provenance) labels choices absent from the pinned plans. This branch proposes them for PR review; they are not recorded as previously accepted decisions. The revised resource contract follows architect feedback: server-owned discovery, metadata without implicit SAS issuance, and middleware-supplied context without authN implementation. Installed checks establish schema/example/type consistency, not an implemented API or Azure handoff. |
