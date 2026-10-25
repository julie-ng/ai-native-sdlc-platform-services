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
npm run verify          # Guidance checks and Nuxt production build
npm run preview         # Preview the completed build
```

`npm run build` is available separately. There is no configured lint, explicit typecheck, or application test runner yet; introduce these with the first product code and document the commands. The build does not establish type safety or API correctness.

## Working with agents

Start with [AGENTS.md](./AGENTS.md). It routes to nested instructions for the area being changed; explicitly read those files even if your client does not load them automatically.

The [add-api-endpoint skill](./.agents/skills/add-api-endpoint/SKILL.md) provides the API workflow. Its content is ordinary Markdown with standard skill metadata, so agents can read it directly if native discovery is unavailable. Shared guidance lives in root/nested `AGENTS.md`; client-specific adapters are managed separately.

Project knowledge belongs in repository documentation. Personal memories and other repository checkouts are optional and are not required to understand or build this application.
