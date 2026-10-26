# Executable artifact foundation

Issue #6 implements the merged PR #12 contract. The [overview](./README.md) and [implementation details](./implementation.md) remain the behavioral specification. No routes, service composition, authentication, migrations or live adapters are supplied here.

## Export ownership

| Module | Exports / downstream use |
| --- | --- |
| `shared/utils/artifact-schemas/schemas.ts` | `schemas`, generated from OpenAPI; one schema source for runtime and types |
| `shared/utils/artifact-schemas/validation.utils.ts` | `artifactValidator`, `isArtifactValue`; strict Ajv/formats validation, cached validators, no coercion/defaults/field removal |
| `shared/types/artifact.ts` | Schema-derived requests, acknowledgments, metadata, caller context and references |
| `server/utils/artifact/ports.ts` | `WorkflowIdentityRepository`, `ArtifactMetadataRepository`, `ArtifactUrlIssuer`, `ArtifactServiceDependencies`, `ArtifactService`, discriminated `Result` and failure types; signatures retained from the merged contract |
| `server/utils/artifact/context.utils.ts` | `readCallerContext`; validates only middleware's caller field and binding ownership/run constraints; failure is `context_unavailable` |
| `server/utils/artifact/policy.utils.ts` | `deriveArtifactAccess`, `canAccessArtifact`, `sameArtifactReference`, `visibleArtifactReferences`; exact binding intersection and de-duplicated any-action visibility |
| `server/utils/artifact/storage-key.utils.ts` | `artifactStorageKey`; validates the complete server-selected reference and derives the stable key, rejecting overrides |

The design files `docs/api/artifact-ports.ts` and `docs/api/artifact-schemas.ts` re-export production-owned definitions for compatibility. Database/Azure adapters must import `server/utils/artifact/ports.ts`; payload consumers use `shared/types/artifact.ts`. Pure modules use explicit relative `.ts` imports because Node's native tests execute them outside Nuxt's alias loader. Nuxt route code should use the repository's normal aliases.

`artifactValidator(name)` exposes Ajv validation errors for future request parsing. `isArtifactValue` narrows caller/reference/request types after validation; other schemas return a boolean. HTTP error sanitization, body/media/query limits and response serialization belong to future route/service work.

## Offline verification and support

- `npm run test:unit` runs native Node 24 tests in one process, without aliases, a server, credentials or a database. Tests must avoid shared environment mutations.
- `npm run typecheck` runs `nuxt typecheck` and the strict standalone `tsconfig.unit.json`, including tests and support modules. `npm run verify` includes both commands.
- `tests/support/artifact-fixtures.ts` loads the exact checked deterministic caller/identity fixtures and validates caller contexts. Fixtures are test-only, injected as trusted middleware context; no token parser or resolver exists.
- `tests/support/artifact-fakes.ts` supplies a scoped read-only metadata fake, workflow-identity fake and URL-issuer spies. Write/signing spies return `unavailable` unless a test explicitly overrides them. No fake successful upload is supplied.
- Tests execute positive/negative schema examples, malformed and spoofed context cases, exact run/step/name matching, planner own-output create/update, coder bound reads, unknown actions/tasks, same-step later execution, and stable validated keys. Port composition probes exercise the contract's 403/404 denial cases without signing. These probes are test support, not production service orchestration.

## Remaining implementation

Routes/service composition must enforce scoped existence before action checks and sign only after authorization. Real metadata adapters must implement stable registration, latest-report/timestamp updates and database constraints; scoped fakes do not prove persistence behavior. Real Azure tests must prove overwrite and permission behavior. Installed SDKs and nonfunctional example URLs establish neither a Blob handoff nor authentication.
