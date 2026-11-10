/**
 * The Nitro server's artifact storage: one Blob client per process, using the
 * service's own Azure identity. Kept out of `azure-sas.utils.ts`, which tests
 * import without the Nitro runtime.
 * @module
 */
import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient } from '@azure/storage-blob'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import type { ArtifactStorage } from './azure-sas.utils.ts'

/** Shared storage, created on first use. */
let storage: ArtifactStorage | undefined

/**
 * Return the shared artifact storage, creating its Blob client on first use.
 * DefaultAzureCredential uses workload identity in a cluster and the configured service principal locally.
 * Call after `requireArtifactConfiguration`, which rejects missing settings with 503.
 * @param event - The request event, for runtime configuration.
 * @returns The cached Azure identity-backed client and configured artifact container.
 */
export function useArtifactStorage(event: H3Event): ArtifactStorage {
  if (!storage) {
    const { artifactStorageAccountUrl, artifactStorageContainer } = useRuntimeConfig(event)
    storage = {
      service: new BlobServiceClient(artifactStorageAccountUrl, new DefaultAzureCredential()),
      container: artifactStorageContainer,
    }
  }
  return storage
}
