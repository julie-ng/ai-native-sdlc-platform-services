/**
 * Explicit guard that fails artifact routes fast when the service is not configured.
 * @module
 */
import { createError } from 'h3'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { requireStorageConfiguration } from '../readiness.utils.ts'

/**
 * Require the database URL and artifact storage settings. Call in every artifact
 * route after `requireCallerContext`, so a misconfigured service answers 503
 * rather than 500. Checks configuration only; it does not connect to either.
 * @param event - The request event.
 * @throws H3Error 503 when the database URL, storage account URL or container is not configured.
 */
export function requireArtifactConfiguration(event: H3Event) {
  const { databaseUrl, artifactStorageAccountUrl, artifactStorageContainer } = useRuntimeConfig(event)
  try {
    if (!databaseUrl) {
      throw new Error('NUXT_DATABASE_URL is not set')
    }
    requireStorageConfiguration(artifactStorageAccountUrl, artifactStorageContainer)
  }
  catch {
    // Do not name the missing setting in the response; it is server configuration.
    throw createError({ statusCode: 503, message: 'Artifact service is not configured' })
  }
}
