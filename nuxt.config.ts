// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },
  // Private server configuration, set via NUXT_DATABASE_URL,
  // NUXT_ARTIFACT_STORAGE_ACCOUNT_URL and NUXT_ARTIFACT_STORAGE_CONTAINER.
  runtimeConfig: {
    databaseUrl: '',
    artifactStorageAccountUrl: '',
    artifactStorageContainer: 'artifacts',
  },
  compatibilityDate: '2025-07-15',
  eslint: {
    config: {
      stylistic: {
        semi: false,
        quotes: 'single',
        commaDangle: 'always-multiline',
      },
    },
  },
})
