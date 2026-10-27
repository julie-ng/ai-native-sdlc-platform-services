# Shared code instructions

Applies to `shared/**`, in addition to the root instructions.

## Boundaries and layout

- Keep shared code usable on server and browser: no secrets, database clients, provider SDKs, Vue composables, or Pinia dependencies.
- Use `shared/utils/` for pure helpers, `shared/types/` for type contracts, `shared/enums/` for runtime constants, and `shared/utils/zod-schemas/` for Zod schemas.
- Import nested modules explicitly or through a maintained index; do not assume auto-imports.

## Schemas and constants

- Define validation once in Zod and infer types with `z.infer`; do not duplicate schemas or interfaces.
- Keep request, persistence, and trusted caller-context schemas separate. Client-supplied roles and IDs never establish access.
- Define statuses once with `as const`; reuse derived values in schemas, comparisons, and database mappings. Do not hide validator incompatibilities with tuple assertions.
- Test invalid inputs, date/time edges, and serialization where applicable.

## Artifact contracts

- Follow the [ontology](../docs/plans/artifact-service.md#ontology) and [schema/type contract](../docs/api/implementation.md#code-boundaries). Generate OpenAPI from domain schemas; do not edit generated JSON.
- Use `z.strictObject` at every object level. Reject unknown fields; do not coerce, default, or transform wire values. Put cross-field ownership and authorization checks in explicit functions.
- Follow the contract's request/response allowlists and UTC timestamp format; keep server-owned metadata out of write payloads.
- Schema unit tests import domain schemas directly. OpenAPI freshness and documentation-example checks belong in `tests/contract/`; run `npm run test:contract` when changing shapes or examples.

Reference: [Nuxt shared directory](https://nuxt.com/docs/4.x/directory-structure/shared).
