# Platform Services

Nuxt 4 application for RESTful platform APIs. The initial release focuses on APIs; product UI follows later. See [architecture and decisions](./docs/architecture.md) for implemented capabilities, agreed stack choices, and open decisions.

## Development

Use Node.js 24 (see [.node-version](./.node-version)) and npm.

```bash
npm ci
npm run dev
```

The development server defaults to `http://localhost:3000`.

## Verification and production

```bash
npm run check:guidance  # Local documentation links and portable skill metadata
npm run generate:artifact-openapi # Generate OpenAPI after editing Zod/HTTP definitions
npm run check:artifact-contract # Alias for test:contract
npm run test:contract   # Generated OpenAPI freshness, structure and generation
npm run lint            # ESLint checks; warnings fail
npm run lint:fix        # Apply available ESLint fixes
npm run test:unit       # Offline native Node tests
npm run typecheck       # Nuxt and standalone tests/support TypeScript
npm run verify          # All checks above and Nuxt production build
npm run preview         # Preview the completed build
```

`npm run build` is available separately. [Nuxt ESLint](https://eslint.nuxt.com/packages/module) checks JavaScript, TypeScript, and Vue using the repository's style conventions. `npm ci` generates its Nuxt configuration through the existing preparation hook. `typecheck` runs `nuxt typecheck` plus the strict standalone [test/support project](./tsconfig.unit.json). `test:unit` uses Node 24 native TypeScript support, `node:test` and `node:assert/strict`, in one process. No cloud credentials or database are needed.

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

## Artifact service foundation

The merged [artifact contract](./docs/api/README.md), [artifact plan](./docs/plans/artifact-service.md) and [workflow identity reference](./docs/plans/workflow-service.md) define the API. Handwritten Zod schemas, trusted-context validation, pure policy and stable storage-key derivation are implemented. Artifacts belong to steps, retain one ID/blob across retries, and permit planner updates to their own bound plan. The service consumes complete trusted caller context without a workflow-step lookup dependency; tests inject server-owned contexts. Authentication/context construction is deferred, with HMAC versus Kubernetes ServiceAccount authentication undecided. No routes, service orchestration, database schema/migrations or Azure integration are implemented.

`shared/utils/zod-schemas/` contains the schema source of truth, grouped by domain with comments. Runtime code uses `safeParse`; TypeScript types use `z.infer`. `npm run generate:artifact-openapi` generates `docs/api/artifact.openapi.json` from those schemas and handwritten HTTP definitions in `scripts/openapi/artifact-http.ts`. Edit those TypeScript sources, not the generated JSON. `npm run test:contract` checks generated OpenAPI freshness, structure and deterministic generation. `npm run check:artifact-contract` is a compatibility alias for the contract tests; `typecheck` checks actual source interfaces. Ajv/formats are development-only generated-contract checkers. Unit tests exercise runtime schemas and context/policy/storage-key functions. Contract tests check documented denial examples; real service/HTTP tests must establish status selection and signing order when those implementations exist. See the [adapter handoff](./docs/api/foundation.md) for exports, test support and remaining work.
