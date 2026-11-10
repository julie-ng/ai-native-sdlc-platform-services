import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },
  // Private server configuration, set via NUXT_DATABASE_URL,
  // NUXT_ARTIFACT_STORAGE_ACCOUNT_URL, NUXT_ARTIFACT_STORAGE_CONTAINER and NUXT_LOG_LEVEL.
  runtimeConfig: {
    databaseUrl: '',
    databaseEntraAuth: false,
    hmacKey: '',
    hmacTokenExpiryMinutes: 15,
    adminToken: '',
    artifactStorageAccountUrl: '',
    artifactStorageContainer: 'artifacts',
    logLevel: 'info',
    public: {
      // NUXT_PUBLIC_ENVIRONMENT. Not a secret: public values reach the client.
      environment: '',
    },
  },
  compatibilityDate: '2025-07-15',
  hooks: {
    // Log unexpected request errors as JSON before Nuxt's own error handler runs.
    'nitro:config'(config) {
      const handlers = [config.errorHandler ?? []].flat()
      config.errorHandler = [fileURLToPath(new URL('./server/error-handler.ts', import.meta.url)), ...handlers]
    },
  },
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
