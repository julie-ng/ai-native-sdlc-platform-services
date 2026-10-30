// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },
  // Private server configuration, set via NUXT_DATABASE_URL,
  // NUXT_ARTIFACT_STORAGE_ACCOUNT_URL, NUXT_ARTIFACT_STORAGE_CONTAINER and NUXT_LOG_LEVEL.
  runtimeConfig: {
    databaseUrl: '',
    artifactStorageAccountUrl: '',
    artifactStorageContainer: 'artifacts',
    logLevel: 'info',
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
