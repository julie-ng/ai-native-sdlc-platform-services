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

Reference: [Nuxt 4 shared directory](https://nuxt.com/docs/4.x/directory-structure/shared).
