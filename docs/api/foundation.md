# Executable artifact foundation

Issue #6 implements the merged PR #12 contract. The [overview](./README.md) and [implementation details](./implementation.md) remain the behavioral specification. No routes, service composition, authentication, migrations or live adapters are supplied here.

## Schema workflow

```text
EDIT BY HAND
shared/utils/zod-schemas/*.schema.ts   Data shapes and validation rules
scripts/artifact-openapi.ts            HTTP methods, paths, statuses and examples
                |
                +--> Runtime: schema.safeParse(input)
                +--> Types: z.infer<typeof schema>
                |
                v
npm run generate:artifact-openapi
                |
                v
docs/api/artifact.openapi.json          GENERATED; review and commit, never hand edit
                |
                v
npm run verify                         Freshness, examples, tests, types and build
```

- Edit the Zod domain schemas when fields or constraints change. Update affected examples in `docs/api/examples.json`, contexts in `docs/api/caller-contexts.fixture.json` and behavior tests as needed; these are handwritten test data.
- Edit `scripts/artifact-openapi.ts` when paths, methods, statuses, headers or HTTP documentation change. Zod schemas cannot infer that operation metadata.
- Run `npm run generate:artifact-openapi`, review the generated diff, then run `npm run verify` and `git diff --check`. The contract check fails if generated OpenAPI is stale.
- JSON is an output format for OpenAPI, not the schema authoring format. No TypeScript schema constants or payload type files are generated.

## Export ownership

| Module | Exports / downstream use |
| --- | --- |
| `shared/utils/zod-schemas/common.schema.ts` | Reusable UUID, slug, timestamp and metadata constraints |
| `shared/utils/zod-schemas/caller-context.schema.ts` | `artifactRefSchema`, `callerContextSchema`; middleware context shape, separate from HTTP claims |
| `shared/utils/zod-schemas/artifact.schema.ts` | Registration/completion requests, write acknowledgments, metadata/list responses and ID parameters |
| `shared/utils/zod-schemas/sas.schema.ts` | Upload/download capability responses and closed header allowlists |
| `shared/utils/zod-schemas/error.schema.ts` | Error envelopes and field categories |
| `shared/utils/zod-schemas/index.ts` | `artifactSchemas`; named components for generation and checked examples |
| `shared/types/artifact.ts` | Payload/context types inferred with `z.infer`; no duplicate field definitions |
| `server/utils/artifact/ports.ts` | `WorkflowStepLookup`, `ArtifactMetadataRepository`, `ArtifactUrlIssuer`, `ArtifactServiceDependencies`, `ArtifactService`, discriminated `Result` and failure types; workflow lookup dependency is `workflowSteps` |
| `server/utils/artifact/context.utils.ts` | `readCallerContext`; validates middleware context shape and binding ownership/run constraints |
| `server/utils/artifact/policy.utils.ts` | Exact task/binding policy and de-duplicated visibility scopes |
| `server/utils/artifact/storage-key.utils.ts` | `artifactStorageKey`; validates the complete server-selected reference and derives the stable key |

`docs/api/artifact-ports.ts` re-exports production-owned interfaces for compatibility. Adapters import `server/utils/artifact/ports.ts`; payload consumers use `shared/types/artifact.ts`. Pure modules use explicit relative `.ts` imports so native Node tests can execute them without Nuxt's alias loader. Nuxt route code should use the repository's normal aliases.

## Runtime validation

Import the domain schema and call `safeParse` on unknown input. For example:

```ts
const parsed = createArtifactRequestSchema.safeParse(body)
if (parsed.success) {
  // parsed.data has the inferred request type.
}
else {
  // parsed.error.issues describes validation failures.
  // Future HTTP code must sanitize these into the contract's error envelope.
}
```

Every object uses `z.strictObject` so unknown fields are rejected, including nested fields. Schemas do not coerce, trim, fill defaults or transform input. `readCallerContext` additionally checks same-run bindings and own-step outputs; shape validation does not authenticate a caller or grant resource access. HTTP validation/error shaping and response serialization remain future route/service work.

Zod's built-in JSON Schema export targets OpenAPI 3.0. Schema definitions use representable constraints; cross-field ownership and authorization stay in explicit functions and tests. Ajv/formats are development-only dependencies used by the contract checker to independently validate generated OpenAPI examples. Production validation uses Zod directly.

## Offline verification and support

- `npm run test:unit` runs native Node 24 tests in one process, without aliases, a server, credentials or a database. Tests must avoid shared environment mutations.
- `npm run typecheck` runs `nuxt typecheck` and the strict standalone `tsconfig.unit.json`, including tests and support modules. `npm run verify` includes both commands.
- `tests/support/artifact-fixtures.ts` loads the exact checked deterministic caller/identity fixtures and validates caller contexts. Fixtures are test-only, injected as trusted middleware context; no token parser or resolver exists.
- `tests/support/artifact-fakes.ts` supplies a scoped read-only metadata fake, workflow-step lookup fake and URL-issuer spies. Write/signing spies return `unavailable` unless a test explicitly overrides them. No fake successful upload is supplied.
- Tests execute positive/negative schema examples, malformed and spoofed context cases, exact run/step/name matching, planner own-output create/update, coder bound reads, unknown actions/tasks, same-step later execution, and stable validated keys. Port composition probes exercise the contract's 403/404 denial cases without signing. These probes are test support, not production service orchestration.

## Remaining implementation

- Routes/service composition must enforce scoped existence before action checks and sign only after authorization.
- Real metadata adapters must implement stable registration, latest-report/timestamp updates and database constraints; scoped fakes do not prove persistence behavior.
- Real Azure tests must prove overwrite and permission behavior.
- Installed SDKs and nonfunctional example URLs establish neither a Blob handoff nor authentication.
