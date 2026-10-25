# Vue application instructions

Applies to `app/**`, in addition to the root instructions. Product UI is deferred beyond the initial API release. Pinia, Tailwind CSS, and Nuxt UI are agreed choices for that stage, not installed capabilities.

## Components

- Use Vue Composition API and `<script setup lang="ts">`. Reusable component filenames and template component names use PascalCase; attributes use kebab-case. Keep Nuxt special filenames and file-based routing conventions (`app.vue`, `pages/index.vue`, `[id].vue`).
- Organize components by feature when features exist. Use `defineModel()` for two-way binding rather than manually pairing a `modelValue` prop and update event.
- Use a single template root for attribute inheritance. When exposing a customization slot, offer a prop fallback when applicable.
- Once the UI stack is installed, prefer Nuxt UI components and Tailwind utilities over hand-rolled equivalents or `<style scoped>` blocks.
- Pages own route/query state. Children emit intent (`select`, `close`); pages update the URL.

## Data lifecycle and stores

- Fetch where the data lifecycle is owned: normally a page or coordinating composable. Repeated or rapidly swapped leaf components render props or reactive cached getters instead of independently clearing/refetching the same data.
- A component reused across changing IDs must not snapshot its initial ID. Derive reads reactively; if it legitimately fetches lazy relational data, watch the ID with `{ immediate: true }`.
- Use `useFetch`/`useAsyncData` for SSR-rendered data; avoid bare setup-time `$fetch` that runs again during hydration. Keep `useAsyncData` handlers focused on returning data. For actions that populate Pinia state, Nuxt's documented `callOnce` pattern can be appropriate; it does not return fetched data.
- Once Pinia is introduced, stores own one domain's state, API operations, validation, loading, and errors. Explicitly import stores. Coordinate domain stores in pages/composables rather than importing one domain store into another.
- Store actions use `$fetch` or `useRequestFetch` when SSR requests need the incoming request's cookies. Avoid layering `useFetch` state inside store state.
- Preserve reactive getters: reference the store directly, use a computed expression, or `storeToRefs` for destructuring. An intentional editable form snapshot is separate from live display state.
- Add caching only when needed, with explicit invalidation/freshness rules. Optimistic writes must retain a snapshot for rollback on failure.
- Reuse shared schemas for domain validation in stores and the server. Components display errors and may manage interaction state; do not duplicate domain validation rules.
- Keep browser-only features in client-only execution or `<ClientOnly>` where SSR cannot support them. Never import server-only code or private configuration.

References: [Nuxt data fetching](https://nuxt.com/docs/4.x/getting-started/data-fetching), [callOnce](https://nuxt.com/docs/4.x/api/utils/call-once), and [Pinia with Nuxt](https://pinia.vuejs.org/ssr/nuxt.html). Recheck current APIs when the UI stack is installed.
