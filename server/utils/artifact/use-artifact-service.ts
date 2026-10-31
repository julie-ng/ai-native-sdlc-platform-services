/**
 * Composition root of the artifact service: wires the PostgreSQL repository (on the
 * shared database pool) and the Azure URL issuer from runtime configuration.
 * @module
 */
import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'
import { createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { useDB } from '../../db/use-db.ts'
import { createAzureUrlIssuer } from './azure-sas.utils.ts'
import { createArtifactRepository } from './repository.utils.ts'
import { createArtifactService } from './service.utils.ts'
import type { ArtifactService } from './service.utils.ts'

/** Process-wide service instance, created on first use. */
let service: ArtifactService | undefined

/**
 * Lazily build the artifact service once per Nitro process, on the shared
 * database pool (`useDB`) and one Blob client using the service's own Azure
 * identity (DefaultAzureCredential: workload identity in a cluster, `az login` locally).
 * @throws H3Error 503 when the database URL, storage account URL or container is not configured.
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
  service = createArtifactService({
    repository: createArtifactRepository(useDB()),
    urls: createAzureUrlIssuer({
      service: new BlobServiceClient(artifactStorageAccountUrl, new DefaultAzureCredential()),
      container: artifactStorageContainer,
    }),
  })
  return service
}
