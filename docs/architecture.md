# Architecture and decisions

## Current state

Platform Services is a Nuxt 4 application being developed to expose RESTful APIs. The initial release has no product UI.

- The application is currently the Nuxt minimal starter, including its welcome page. No product API endpoints, authentication, database schema, or migrations are implemented.
- Installed runtime dependencies are Nuxt, Vue, and Vue Router; [package.json](../package.json) and [package-lock.json](../package-lock.json) are authoritative for versions.
- Node.js 24 and npm are the development baseline. Nuxt project references are configured in [tsconfig.json](../tsconfig.json).
- The `server/`, `server/db/`, and `shared/` directories currently contain guidance for future code. Their presence does not mean those capabilities are implemented.
- `npm run check:guidance` validates local Markdown file references and shared skill metadata. Nuxt ESLint checks JavaScript, TypeScript, and Vue with stylistic rules matching repository conventions. `npm run verify` runs lint, guidance checks, and the Nuxt production build. Explicit typechecking and application tests are not configured yet.
- GitHub Actions runs verification on pull requests targeting `main` and pushes to `main`, with manual dispatch available. A non-blocking npm audit includes development dependencies and summarizes high and critical findings in the job summary.

## Agreed direction

| Area | Decision | Implementation status |
| --- | --- | --- |
| First release | RESTful APIs, with UI deferred | API resources and contracts still to define |
| Language | TypeScript by default, including Vue script logic | Convention established; product code pending |
| Persistence | Drizzle is the ORM | Not installed; database engine and driver undecided |
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

- Initial API resources, consumers, request/response contracts, and authentication/authorization model.
- Database engine, deployment/runtime, connection lifecycle, and migration execution environment.
- Runtime validation library. Shared schema validation is the preferred pattern; no library has been selected or installed. Decide with the first endpoint rather than assuming a dependency exists.
- Test runner and explicit typechecking setup when product code is introduced.

## Decision log

| Date / context | Decision and reason |
| --- | --- |
| 2026-10-25 / repository bootstrap | Start with TypeScript and REST APIs; defer UI implementation to keep the first release focused. Drizzle is the chosen ORM; Pinia, Tailwind, and Nuxt UI are reserved for later UI work. |
| 2026-10-25 / coding preferences | Use PascalCase components and adapt utility/composable conventions to TypeScript. Do not inherit another application's domain model, credentials, or service choices. |
| 2026-10-25 / agent portability | Author rules once in root/nested `AGENTS.md` and workflows in standard `SKILL.md` files. Client adapters are separate; repo docs must support fresh sessions independently of personal memory. |
| 2026-10-25 / continuous integration | Use the official Nuxt ESLint module with flat configuration and stylistic rules to check framework code and existing conventions together. Make lint, guidance checks, and a single production build required CI steps through `verify`. Keep npm audit informational, including high and critical advisory details in the job summary; audit failures do not block delivery. Defer tests and explicit typechecking until introduced separately. |
