# Vue application instructions

Applies to `app/**`, in addition to the root instructions.

## Components

- Use Composition API, PascalCase template component names, and kebab-case attributes. Preserve Nuxt's special filenames and routing conventions.
- Group components by feature. Use `defineModel()` for two-way binding.
- Use a single template root for attribute inheritance. Offer a prop fallback for customization slots where applicable.
- Prefer Nuxt UI components and Tailwind utilities when installed.
- Pages own route/query state; children emit intent and pages update the URL.

## Data lifecycle and stores

- Fetch in the owning page or composable; leaf components consume props or reactive cached data. Keep reads reactive when IDs change; watch IDs with `{ immediate: true }` for lazy relational fetching.
- Use `useFetch`/`useAsyncData` for SSR data, not bare setup-time `$fetch`. Keep async-data handlers focused on returning data; consider `callOnce` for store-populating actions; it does not return fetched data.
- Pinia stores own one domain's state, API calls, validation, loading, and errors. Import stores explicitly and coordinate domains in pages/composables, not between stores.
- Store actions use `$fetch`, or `useRequestFetch` to forward SSR request cookies. Do not nest `useFetch` state inside store state.
- Preserve reactivity with store references, computed getters, or `storeToRefs`; keep editable form snapshots separate.
- Cache only with explicit freshness/invalidation rules. Retain rollback snapshots for optimistic writes.
- Reuse shared Zod schemas for domain validation before mutations. Components display errors rather than duplicating validation rules.
- Restrict browser-only features to client execution or `<ClientOnly>`.

References: [Nuxt data fetching](https://nuxt.com/docs/4.x/getting-started/data-fetching), [callOnce](https://nuxt.com/docs/4.x/api/utils/call-once), and [Pinia with Nuxt](https://pinia.vuejs.org/ssr/nuxt.html).
