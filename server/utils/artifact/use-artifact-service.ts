import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'
import { createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createDatabase } from '../../db/connection.ts'
import { createAzureUrlIssuer } from './azure-sas.utils.ts'
import { createArtifactRepository } from './repository.utils.ts'
import { createArtifactService } from './service.utils.ts'
import type { ArtifactService } from './service.utils.ts'

let service: ArtifactService | undefined
let closePool: (() => Promise<void>) | undefined

/**
 * Lazily build the artifact service once per Nitro process: one pg pool
 * (max 5) and one Blob client using the service's own Azure identity
 * (DefaultAzureCredential: workload identity in a cluster, `az login` locally).
 */
export function useArtifactService(): ArtifactService {
  if (service) {
    return service
  }
  const { databaseUrl, artifactStorageAccountUrl, artifactStorageContainer } = useRuntimeConfig()
  if (!databaseUrl || !artifactStorageAccountUrl.startsWith('https://') || !artifactStorageContainer) {
    // Do not name the missing setting in the response; it is server configuration.
    throw createError({ statusCode: 503, message: 'Artifact service is not configured' })
  }
  const { db, pool } = createDatabase(databaseUrl)
  closePool = () => pool.end()
  service = createArtifactService({
    repository: createArtifactRepository(db),
    urls: createAzureUrlIssuer({
      service: new BlobServiceClient(artifactStorageAccountUrl, new DefaultAzureCredential()),
      container: artifactStorageContainer,
    }),
  })
  return service
}

export async function closeArtifactService() {
  await closePool?.()
  service = undefined
  closePool = undefined
}
