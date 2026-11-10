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

[`docs-site/`](./docs-site/) is an [Astro Starlight](https://starlight.astro.build/) site with two generated sections: **HTTP API** from the [OpenAPI contract](./docs/api/README.md) (`docs/api/artifact.openapi.json`, via [starlight-openapi](https://github.com/HiDeoo/starlight-openapi)) and **Code reference** from the JSDoc in `server/utils/` and `server/db/` (via [starlight-typedoc](https://github.com/HiDeoo/starlight-typedoc)). `shared/` schemas and route handlers have no JSDoc by design: the schemas and the HTTP contract document them.

The site has its own dependencies. Install the root dependencies first: TypeDoc reads the Nuxt-generated tsconfig.

```bash
npm ci && npm ci --prefix docs-site
npm run docs:dev    # Preview at http://localhost:4000/ai-native-sdlc-platform-services/; regenerates on source changes
npm run docs:check  # Fail on undocumented exports or broken {@link}s in the documented scope
npm run docs:build  # docs:check, then the static site into docs-site/dist/
```

[docs-site/typedoc.json](./docs-site/typedoc.json) defines the documented scope and validation for both the site and `docs:check`. The documentation commands are not part of `verify`.

`GET /` is public and returns `200 OK` with `application/json`: `{"name":"platform-services"}`. It accepts no input and identifies the service; it does not check dependency health (see [readiness](#logging-and-readiness)).

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

`npm run build` is available separately. [Nuxt ESLint](https://eslint.nuxt.com/packages/module) checks JavaScript, TypeScript, and Vue using the repository's style conventions. `npm ci` generates its Nuxt configuration through the existing preparation hook. ESLint also requires JSDoc parameter and return tags in server utilities and database modules, excluding tests and migrations; TypeDoc checks exported documentation separately. `typecheck` runs `nuxt typecheck` plus the strict standalone [test/support project](./tsconfig.unit.json). `test:unit` and `test:contract` use [Vitest](https://vitest.dev/) with each test file isolated. No cloud credentials or database are needed; `test:db` (below) needs Docker.

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

The [artifact API](./docs/api/README.md) and [artifact plan](./docs/plans/artifact-service.md) describe the service. Routes under `server/api/artifacts/` call explicit guards that apply the planner/coder policy, then plain Drizzle/PostgreSQL query and Azure user delegation SAS functions. Artifacts belong to steps and keep one ID/blob across retries. Bytes go directly between callers and Azure.

Each route explicitly awaits `requireStepContext`, which authenticates HMAC step credentials against stored run/step records and constructs `event.context.step`. Admin-protected `POST /api/runs` creates one planner and one coder atomically, returning their tokens and a shared `expiresAt` (15 minutes by default). See the [authentication contract](./docs/api/implementation.md#run-creation-and-authentication). The dev context stub has been removed.

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
| `NUXT_DATABASE_ENTRA_AUTH` | Set to `true` to use an Entra token for PostgreSQL; defaults to `false` (URL password) |
| `NUXT_HMAC_KEY` | Private server-side HMAC signing secret; required for step authentication and issuance |
| `NUXT_HMAC_TOKEN_EXPIRY_MINUTES` | Positive finite step-token lifetime from run creation; defaults to 15 minutes |
| `NUXT_ADMIN_TOKEN` | Private admin Bearer credential for `POST /api/runs` |
| `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL` | Blob service endpoint, e.g. `https://<account>.blob.core.windows.net` |
| `NUXT_ARTIFACT_STORAGE_CONTAINER` | Container name; defaults to `artifacts` |
| `NUXT_LOG_LEVEL` | pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`); defaults to `info`. Unknown values fall back to `info` with a warning |
| `NUXT_PUBLIC_ENVIRONMENT` | Deployment environment name, public (not a secret); empty by default; does not affect authentication |

The Blob client uses `DefaultAzureCredential`: workload identity in the cluster and, for local development, a service principal set through `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` in `.env`. Its identity needs read/write data access to the container (for example, Storage Blob Data Contributor scoped to the container) plus Storage Blob Delegator at the storage account scope or above, because [Get User Delegation Key acts at the account level](https://learn.microsoft.com/en-us/rest/api/storageservices/create-user-delegation-sas). Missing configuration returns 503.

### Azure PostgreSQL with Microsoft Entra

Set `NUXT_DATABASE_ENTRA_AUTH=true` to authenticate with `DefaultAzureCredential` instead of a URL password. For the cluster identity, use:

```dotenv
NUXT_DATABASE_ENTRA_AUTH=true
NUXT_DATABASE_URL=postgresql://platform-services-mi@<server>.postgres.database.azure.com:5432/workflow
```

Entra mode reads the host, port (default 5432), database and username from this URL, ignores URL passwords and query parameters, and always requires TLS with certificate verification. Use a passwordless URL. One credential is reused; each new pool connection calls `getToken('https://ossrdbms-aad.database.windows.net/.default')` and supplies the returned token as its password. Azure Identity manages token caching; no token is stored in the URL or logged by application code. Without the opt-in, the existing URL-based Docker connection is unchanged. See [node-postgres dynamic passwords](https://node-postgres.com/features/connecting#programmatic).

The scope is defined by Azure PostgreSQL, independently of the application's hosting service: [PostgreSQL's managed-identity documentation](https://learn.microsoft.com/en-us/azure/postgresql/security/security-connect-with-managed-identity#connect-by-using-managed-identity-in-c) shows the exact `https://ossrdbms-aad.database.windows.net/.default` value. [AKS workload identity guidance](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview#azure-identity-client-libraries) documents using `DefaultAzureCredential` (which attempts `WorkloadIdentityCredential`) and requesting scopes in `<resource>/.default` format. In AKS, the projected service-account token is exchanged through Entra for a PostgreSQL access token; the scope identifies the target database service. `AZURE_DATABASE_RESOURCE` names the fixed public-cloud database resource `https://ossrdbms-aad.database.windows.net` in code; `/.default` is appended when requesting a token.

For a manual check on your development machine (with Azure CLI installed):

1. Run `az login --tenant <tenant-id>` as your Entra PostgreSQL administrator.
2. Remove `AZURE_CLIENT_SECRET` and other service-principal credentials from the process environment and local `.env` for this check, so the configured service principal does not take precedence over Azure CLI. This also affects the Blob client's credential selection.
3. Set the opt-in and a URL using your own PostgreSQL Entra admin role as the username, not `platform-services-mi`. URL-encode the username, for example `julie%40example.com`. Use the actual server hostname and `workflow` database.
4. Keep the existing storage URL/container configured (readiness checks their configuration only), start `npm run dev`, and run `curl -i http://localhost:3000/readyz`.

Expect HTTP 200 with `checks["postgres:connection"][0].status` equal to `pass`. This proves the current connection can execute `select 1`; it does not verify cluster workload identity or schema/migration permissions. The Azure check is human-run; cluster migrations and deployment remain separate work.

### Trying the artifact routes locally

Set `NUXT_DATABASE_URL`, `NUXT_HMAC_KEY` and `NUXT_ADMIN_TOKEN` in your local `.env`, alongside the Azure settings above. Generate separate random signing/admin secrets; neither belongs in source control. Optional `NUXT_HMAC_TOKEN_EXPIRY_MINUTES` defaults to 15. `NUXT_PUBLIC_ENVIRONMENT` no longer enables authentication bypasses.

For the #41 migration, discard old disposable local data with `npm run db:down` before starting PostgreSQL again: old steps have no trustworthy role to backfill. Do not apply this migration to a populated shared database.

```bash
npm run db:up
NUXT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:migrate
npm run dev
```

In another terminal, use the admin token to create a run (no request body):

```bash
curl -X POST localhost:3000/api/runs -H "Authorization: Bearer $NUXT_ADMIN_TOKEN"
```

The 201 response has `runId`, UTC `expiresAt`, and `steps.planner` / `steps.coder`, each containing `stepId` and `token`. Both tokens expire together. Set `RUN_ID`, `PLANNER_STEP_ID`, `PLANNER_TOKEN`, `CODER_STEP_ID` and `CODER_TOKEN` from that response in your shell. Keep credentials private. These requests assume the shell has the admin variable set; Nuxt loading `.env` does not export it into your terminal.

```bash
# Planner: register, upload to the returned SAS URL, then report the upload.
curl -X POST localhost:3000/api/artifacts \
  -H "Authorization: Bearer $PLANNER_TOKEN" -H "X-Run-Id: $RUN_ID" -H "X-Step-Id: $PLANNER_STEP_ID" \
  -H 'Content-Type: application/json' -d '{"name":"plan","contentType":"text/plain"}'
curl -X PUT "<upload.url>" -H 'x-ms-blob-type: BlockBlob' -H 'Content-Type: text/plain' --data-binary @plan.txt
curl -X PUT localhost:3000/api/artifacts/<id> \
  -H "Authorization: Bearer $PLANNER_TOKEN" -H "X-Run-Id: $RUN_ID" -H "X-Step-Id: $PLANNER_STEP_ID" \
  -H 'Content-Type: application/json' -d '{"state":"uploaded","sizeBytes":<size>,"sha256":"<hex>"}'

# Coder: discover, read metadata, get a download SAS, download.
curl localhost:3000/api/artifacts \
  -H "Authorization: Bearer $CODER_TOKEN" -H "X-Run-Id: $RUN_ID" -H "X-Step-Id: $CODER_STEP_ID"
curl localhost:3000/api/artifacts/<id> \
  -H "Authorization: Bearer $CODER_TOKEN" -H "X-Run-Id: $RUN_ID" -H "X-Step-Id: $CODER_STEP_ID"
curl localhost:3000/api/artifacts/<id>/sas \
  -H "Authorization: Bearer $CODER_TOKEN" -H "X-Run-Id: $RUN_ID" -H "X-Step-Id: $CODER_STEP_ID"
curl "<url>" -o downloaded.txt
```

Missing, malformed, expired or mismatched step credentials all return generic 401. Coder upload reports for the visible planner artifact return 403; registration still targets the caller's own slot, which is invisible to a coder and therefore returns 404. Missing authentication configuration returns 503. A new run is needed after token expiry; there is no renewal endpoint.

Verified locally on 2026-11-10 (#41) against the production build, disposable PostgreSQL 17 and the configured `local-dev` Azure container: admin run issuance, planner upload/report, coder discovery and byte-for-byte download, invalid admin and wrong-step 401s, coder report 403, and actual expiry using a shortened window. Each tested rejection emitted exactly one security event; captured logs and error responses contained no test credentials or SAS URLs. The temporary blob was deleted. Automated coverage remains direct Vitest unit/guard tests and PostgreSQL integration tests; HTTP flows are checked manually. The proposed additional HTTP testing layer (#42) was declined. Cluster execution is unverified.

### Logging and readiness

The server writes JSON lines to stdout with [pino](https://getpino.io/); Kubernetes collects them. Each line has a `domain`:

| Domain | Lines |
| --- | --- |
| `http` | One access line per response (`method`, `path`, `search`, `status`, `duration`), except `/readyz`. Unhandled request errors at `error` level with `err`; expected `createError()` responses appear in the access log, with separate security events for authentication failures and artifact 403s |
| `security` | One warning per authentication rejection or artifact 403, with reason, IP, user agent, method, pathname and allowlisted IDs/actions; no credentials or SAS URLs |
| `db` | Failed idle database connections; the pool replaces them instead of the process exiting |
| `readyz` | One `error` line per failed readiness check, with `check`, the driver `code` if any, and `err` |

Request and response bodies, authorization headers and full step context are never logged. Security events include the user agent and validated run/step IDs, not credential values. SAS URLs may appear in logs, for example in error messages; that is an [accepted risk](./docs/architecture.md#decision-log). `NUXT_LOG_LEVEL=warn` suppresses access lines.

`GET /readyz` is the Kubernetes readiness probe: public, outside `/api`, no step context guard. It responds with `application/health+json` and `Cache-Control: no-store`:

```json
{
  "status": "pass",
  "message": "Server is up and running.",
  "timestamp": "2026-10-30T13:58:04.299Z",
  "uptime": 1234,
  "uptime_human_readable": "20 minutes and 34 seconds",
  "checks": {
    "postgres:connection": [{ "componentType": "datastore", "status": "pass", "time": "2026-10-30T13:58:04.299Z" }],
    "azure-storage:configuration": [{ "componentType": "component", "status": "pass", "time": "2026-10-30T13:58:04.299Z" }]
  }
}
```

- `postgres:connection` runs `select 1` on the shared pool. It fails when the database is unreachable or `NUXT_DATABASE_URL` is unset.
- `azure-storage:configuration` checks that `NUXT_ARTIFACT_STORAGE_ACCOUNT_URL` is HTTPS and `NUXT_ARTIFACT_STORAGE_CONTAINER` is set. It does not call Azure, so it cannot detect missing credentials or roles.
- `200` when every check passes; otherwise `503` with `status: fail` and the failing check marked `fail`. Causes go to the log only.

Probe manifests belong in the infrastructure repository. There is no liveness endpoint.
