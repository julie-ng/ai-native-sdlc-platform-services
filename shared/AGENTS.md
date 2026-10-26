# Shared code instructions

Applies to `shared/**`, in addition to the root instructions.

- Shared code must be safe in both server and browser contexts. Keep secrets, database clients, provider SDKs, Vue composables, and Pinia dependencies out of this directory.
- Use `shared/utils/` for pure reusable helpers, `shared/types/` for shared type contracts, and `shared/enums/` for runtime constants/value lists when needed. Keep schema files together under `shared/utils/zod-schemas/` if Zod is selected; otherwise name the directory for the selected schema approach.
- Define runtime validation once and infer TypeScript types from it where supported. Do not maintain divergent handwritten schemas or redundant interfaces for the same input.
- Keep request schemas distinct from persistence schemas. A database insert shape is not automatically a safe public API payload.
- The server validates every untrusted request. When stores are introduced, they reuse applicable shared schemas before sending mutations; components display validation errors instead of independently reimplementing domain validation.
- Define status values once as a typed runtime constant object (`as const`) and a derived value list as needed. Reuse them in comparisons, schemas, and database mappings rather than repeating raw strings. Do not use unchecked tuple assertions to hide an incompatible validator API.
- Use Nuxt's `#shared/` imports inside Nuxt. Do not assume nested files are auto-imported; use explicit imports or a deliberately maintained index.
- Co-locate pure utility tests as `name.utils.test.ts` when test tooling is introduced. Include relevant invalid inputs, date/time edges, and serialization behavior.

## Artifact schemas and types

- Read the [artifact ontology](../docs/plans/artifact-service.md#ontology) and [contract/type ownership](../docs/api/implementation.md#code-boundaries) before implementing shared artifact schemas/types. Handwritten Zod domain schemas under `shared/utils/zod-schemas/` are the source of truth; infer types with `z.infer` and generate OpenAPI. Use common ports; do not create a parallel payload or adapter contract.
- Use `z.strictObject` at every object level; reject unknown fields rather than stripping them. Preserve wire values without coercion, defaults or transforms. Keep exportable field constraints in schemas and cross-field ownership/authorization checks in explicit functions.
- Keep HTTP request schemas distinct from the trusted middleware caller context. Artifact ownership/references are step-based, without attempt identity; a client-provided role, reference or ID never establishes access. Shared types do not make caller-supplied context trustworthy.
- Include server-owned `createdAt`/`updatedAt` in metadata response schemas, using the contract's UTC representation. Do not accept them in registration/completion payloads or add stored metadata to write-only acknowledgments. Preserve closed field allowlists and run `npm run check:artifact-contract` when changing shapes or examples; schema checks do not execute authorization.

Reference: [Nuxt 4 shared directory](https://nuxt.com/docs/4.x/directory-structure/shared).
