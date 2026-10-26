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
npm run check:artifact-contract # Proposed OpenAPI, examples and design-port types
npm run lint            # ESLint checks; warnings fail
npm run lint:fix        # Apply available ESLint fixes
npm run verify          # Lint, guidance/contract checks, and Nuxt production build
npm run preview         # Preview the completed build
```

`npm run build` is available separately. [Nuxt ESLint](https://eslint.nuxt.com/packages/module) checks JavaScript, TypeScript, and Vue using the repository's style conventions. `npm ci` generates its Nuxt configuration through the existing preparation hook. There is no configured application typecheck or application test runner yet; introduce these with the first product code and document the commands. ESLint and the build do not establish type safety or API correctness.

[CI](./.github/workflows/ci.yml) runs on pull requests targeting `main`, pushes to `main`, and manual dispatch. It installs locked dependencies with Node.js 24 from `.node-version`, then runs `npm run verify`, including lint, guidance/contract checks and one production build. Application tests are deferred until a runner and tests exist.

CI also runs [`npm audit --json --audit-level=high`](https://docs.npmjs.com/cli/v11/commands/npm-audit/) across production and development dependencies. Audit failures are non-blocking. The workflow summary describes high and critical findings with affected packages and ranges, dependency relationships, advisory descriptions and links, and reported fixes. Lower severity findings remain in the audit step's JSON log; an unavailable audit is reported as unavailable rather than clean. Review high and critical findings for exposure and compatible upgrades; CI does not apply fixes automatically.

### Audit baseline (2026-10-25)

The locked tree reports seven high severity affected packages and no critical findings, all tracing to [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). `node-forge` through 1.4.0 can accept forged RSA PKCS#1 v1.5 signatures with low-exponent keys because it does not fully validate nested algorithm data. The dependency path is `nuxt → @nuxt/nitro-server → nitropack → listhen → node-forge`; Nuxt's Vite packages also inherit the finding. Application exploitability has not been established. The advisory lists no patched version; npm suggests moving Nuxt to 4.1.3, a downgrade outside this project's declared range. Compatibility and exposure require separate review; no dependency remediation is included here. Rerun the audit for current findings.

## Working with agents

Start with [AGENTS.md](./AGENTS.md). It routes to nested instructions for the area being changed; explicitly read those files even if your client does not load them automatically.

The [add-api-endpoint skill](./.agents/skills/add-api-endpoint/SKILL.md) provides the API workflow. Its content is ordinary Markdown with standard skill metadata, so agents can read it directly if native discovery is unavailable. Shared guidance lives in root/nested `AGENTS.md`; client-specific adapters are managed separately.

Project knowledge belongs in repository documentation. Personal memories and other repository checkouts are optional and are not required to understand or build this application.

## Artifact service planning

Issue #5 provides the proposed [artifact contract](./docs/api/README.md), [artifact plan](./docs/plans/artifact-service.md) and [workflow identity reference](./docs/plans/workflow-service.md). The contract includes OpenAPI, positive/negative examples, exact adapter interfaces and verification instructions. Its airport analogy explains server-owned access and discovery; trusted caller context comes from middleware, with authentication outside this slice. Its provenance table distinguishes requirements and inherited proposals from new choices awaiting PR review. No product routes, database or Azure integration are implemented.

`npm run check:artifact-contract` checks OpenAPI structure, all supplied schemas/examples, generated schema freshness and design-port types on Node 24. It is included in `verify`. Use `npm run generate:artifact-schemas` after editing the contract. Application behavioral tests and full application typechecking remain future implementation work.
