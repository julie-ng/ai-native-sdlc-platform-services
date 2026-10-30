# Platform Services

Nuxt 4 application for RESTful platform APIs. The initial release focuses on APIs; product UI follows later. See [architecture and decisions](./docs/architecture.md) for implemented capabilities, agreed stack choices, and open decisions.

## Development

Use Node.js 24 (see [.node-version](./.node-version)) and npm.

```bash
npm ci
npm run dev
```

The development server defaults to `http://localhost:3000`.

### Documentation site

[`site/`](./site/) is an [Astro Starlight](https://starlight.astro.build/) site with two generated sections: **HTTP API** from the [OpenAPI contract](./docs/api/README.md) (`docs/api/artifact.openapi.json`, via [starlight-openapi](https://github.com/HiDeoo/starlight-openapi)) and **Code reference** from the JSDoc in `server/utils/` and `server/db/` (via [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc)). `shared/` schemas and route handlers have no JSDoc by design: the schemas and the HTTP contract document them.

The site has its own dependencies. Install the root dependencies first: TypeDoc reads the Nuxt-generated tsconfig.

```bash
npm ci && npm ci --prefix site
npm run docs:dev    # Preview at http://localhost:4000/ai-native-sdlc-platform-services/; regenerates on source changes
npm run docs:check  # Fail on undocumented exports or broken {@link}s in the documented scope
npm run docs:build  # docs:check, then the static site into site/dist/
```

[site/typedoc.json](./site/typedoc.json) defines the documented scope and validation for both the site and `docs:check`. The documentation commands are not part of `verify`.

`GET /` is public and returns `200 OK` with `application/json`: `{"name":"platform-services"}`. It accepts no input and identifies the service; it does not check dependency health.

## Verification and production

```bash
npm run check:guidance  # Local documentation links and portable skill metadata
npm run generate:artifact-openapi # Generate OpenAPI after editing Zod/HTTP definitions
npm run check:artifact-contract # Alias for test:contract
npm run test:contract   # Generated OpenAPI freshness, validity and documentation examples
npm run lint            # ESLint checks; warnings fail
npm run lint:fix        # Apply available ESLint fixes
npm run test:unit       # Offline Vitest unit tests
npm run test:watch      # Vitest watch mode
npm run typecheck       # Nuxt and standalone tests/support TypeScript
npm run verify          # All checks above and Nuxt production build
npm run preview         # Preview the completed build
```

`npm run build` is available separately. [Nuxt ESLint](https://eslint.nuxt.com/packages/module) checks JavaScript, TypeScript, and Vue using the repository's style conventions. `npm ci` generates its Nuxt configuration through the existing preparation hook. `typecheck` runs `nuxt typecheck` plus the strict standalone [test/support project](./tsconfig.unit.json). `test:unit` and `test:contract` use [Vitest](https://vitest.dev/) with each test file isolated. No cloud credentials or database are needed; `test:db` (below) needs Docker.

[CI](./.github/workflows/ci.yml) runs on pull requests targeting `main`, pushes to `main`, and manual dispatch. It installs locked dependencies with Node.js 24 from `.node-version`, then runs `npm run verify`, including lint, guidance/contract checks, unit tests, typechecking and one production build.

CI also runs [`npm audit --json --audit-level=high`](https://docs.npmjs.com/cli/v11/commands/npm-audit/) across production and development dependencies. Audit failures are non-blocking. The workflow summary describes high and critical findings with affected packages and ranges, dependency relationships, advisory descriptions and links, and reported fixes. Lower severity findings remain in the audit step's JSON log; an unavailable audit is reported as unavailable rather than clean. Review high and critical findings for exposure and compatible upgrades; CI does not apply fixes automatically.

### Audit baseline (2026-10-25)

The locked tree reports seven high severity affected packages and no critical findings, all tracing to [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). `node-forge` through 1.4.0 can accept forged RSA PKCS#1 v1.5 signatures with low-exponent keys because it does not fully validate nested algorithm data. The dependency path is `nuxt → @nuxt/nitro-server → nitropack → listhen → node-forge`; Nuxt's Vite packages also inherit the finding. Application exploitability has not been established. The advisory lists no patched version; npm suggests moving Nuxt to 4.1.3, a downgrade outside this project's declared range. Compatibility and exposure require separate review; no dependency remediation is included here. Rerun the audit for current findings.

### Audit snapshot (2026-10-26)

After installing the merged contract's dependency baseline, npm reports nine high and four moderate affected packages, with no critical findings. In addition to the bootstrap Nuxt/node-forge chain, Azure Identity inherits an [MSAL Node authorization-code-flow finding](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5). The agreed versions are retained; SDK clients are not constructed in this foundation, and application exposure has not been assessed. Review remediation before implementing live credential flows.

## Working with agents

Start with [AGENTS.md](./AGENTS.md). It routes to nested instructions for the area being changed; explicitly read those files even if your client does not load them automatically.

The [add-api-endpoint skill](./.agents/skills/add-api-endpoint/SKILL.md) provides the API workflow. Its content is ordinary Markdown with standard skill metadata, so agents can read it directly if native discovery is unavailable. Shared guidance lives in root/nested `AGENTS.md`; client-specific adapters are managed separately.

Project knowledge belongs in repository documentation. Personal memories and other repository checkouts are optional and are not required to understand or build this application.

## Artifact service

The [artifact API](./docs/api/README.md) and [artifact plan](./docs/plans/artifact-service.md) describe the service. Routes under `server/api/artifacts/` call a service that applies the planner/coder policy, a Drizzle/PostgreSQL repository, and an Azure user delegation SAS issuer. Artifacts belong to steps and keep one ID/blob across retries. Bytes go directly between callers and Azure.

Authentication is not implemented: each route explicitly calls the `requireCallerContext` guard, which today only validates an `event.context.caller` that nothing sets yet, so every artifact request currently returns 503. HMAC versus Kubernetes ServiceAccount authentication is undecided. Real Azure transfer has not been exercised.

`shared/utils/zod-schemas/` is the schema source of truth. `npm run generate:artifact-openapi` generates `docs/api/artifact.openapi.json` from those schemas and the HTTP definitions in `scripts/openapi/artifact-http.ts`; edit those sources, not the JSON. See the [schema workflow](./docs/api/implementation.md#schema-workflow).

### Database

```bash
npm run db:up        # Disposable PostgreSQL 17 in Docker (compose.yaml, tmpfs data)
npm run test:db      # Repository integration tests; each file creates and drops its own database
npm run db:generate  # Generate a migration after editing server/db/schema.ts
npm run db:migrate   # Apply migrations to NUXT_DATABASE_URL
npm run db:down      # Stop and discard the database
```

`test:db` connects to `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/postgres`, matching `compose.yaml`). It is not part of `verify` or CI because it needs Docker.

### Runtime configuration

| Variable | Purpose |
| --- | --- |
| `NUXT_DATABASE_URL` | PostgreSQL connection string |
| `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL` | Blob service endpoint, e.g. `https://<account>.blob.core.windows.net` |
| `NUXT_ARTIFACT_STORAGE_CONTAINER` | Container name; defaults to `artifacts` |

The Blob client uses `DefaultAzureCredential`. Its identity needs read/write data access to the container (for example, Storage Blob Data Contributor scoped to the container) plus Storage Blob Delegator at the storage account scope or above, because [Get User Delegation Key acts at the account level](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas). Missing configuration returns 503.
