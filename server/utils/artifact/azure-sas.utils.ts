/**
 * Short-lived Azure Blob Storage SAS URLs for direct uploads and downloads of
 * artifact bytes.
 * @module
 */
import { BlobSASPermissions, generateBlobSASQueryParameters, SASProtocol } from '@azure/storage-blob'
import type { UserDelegationKey } from '@azure/storage-blob'
import type { DownloadSas, UploadSas } from '../../../shared/types/artifact.ts'
import type { ArtifactRecord } from './repository.utils.ts'
import { deriveBlobName } from './blob.utils.ts'

/** Lifetime of every issued SAS URL: 300 seconds (5 minutes). */
export const sasLifetimeSeconds = 300

/**
 * The part of BlobServiceClient that signing uses. Production passes a client
 * authenticated with the service's own Azure identity; tests pass a fixed key.
 */
export interface UserDelegationKeySource {
  accountName: string
  url: string
  /**
   * Request a key that covers the complete SAS lifetime.
   * @param startsOn - Beginning of the delegation key validity window.
   * @param expiresOn - End of the delegation key validity window.
   * @returns The Azure-issued user delegation key used to sign blob URLs.
   * @throws When Azure credentials or delegation permissions are unavailable.
   */
  getUserDelegationKey(startsOn: Date, expiresOn: Date): Promise<UserDelegationKey>
}

/** Where artifact blobs live, and how to sign URLs for them. */
export interface ArtifactStorage {
  /** Supplies user delegation keys and the account URL. */
  service: UserDelegationKeySource
  /** The blob container that holds all artifacts. */
  container: string
  /** Clock, replaceable in tests; defaults to the current time. */
  now?: () => Date
}

/**
 * Sign a single-blob, HTTPS-only user delegation SAS URL for the record's blob.
 * No account keys. Never log or persist the result.
 * @param storage - Configured user delegation client, container and optional clock.
 * @param storage.service - Azure identity-backed source of delegation keys and account URL.
 * @param storage.container - Container holding the artifact blob.
 * @param storage.now - Optional signing clock; defaults to the current time.
 * @param record - Stored record supplying the blob reference.
 * @param permissions - `r` for download, `w` for upload.
 * @returns The full SAS URL and its expiry as an ISO string.
 */
async function sign({ service, container, now = () => new Date() }: ArtifactStorage, record: ArtifactRecord, permissions: 'r' | 'w') {
  const startsOn = now()
  const expiresOn = new Date(startsOn.getTime() + sasLifetimeSeconds * 1000)
  // The delegation key must cover the SAS lifetime. The SAS itself omits
  // startsOn so small clock differences cannot make it not-yet-valid.
  const key = await service.getUserDelegationKey(startsOn, expiresOn)
  const blobName = deriveBlobName(record.reference)
  const query = generateBlobSASQueryParameters({
    containerName: container,
    blobName,
    permissions: BlobSASPermissions.parse(permissions),
    protocol: SASProtocol.Https,
    expiresOn,
  }, key, service.accountName).toString()
  const url = new URL(`${container}/${blobName}`, service.url.endsWith('/') ? service.url : `${service.url}/`)
  url.search = query
  return { url: url.toString(), expiresAt: expiresOn.toISOString() }
}

/**
 * Sign an upload URL for the record's blob. It uses `w` (create or overwrite)
 * because planners revise their plan.
 * @param storage - Configured user delegation signer and destination container.
 * @param record - Authorized artifact whose reference and content type define the upload.
 * @returns A write SAS with required PUT headers and its expiry; never log or persist it.
 * @throws When the delegation key cannot be obtained or the reference is invalid.
 */
export async function signUpload(storage: ArtifactStorage, record: ArtifactRecord): Promise<UploadSas> {
  const { url, expiresAt } = await sign(storage, record, 'w')
  return {
    url,
    method: 'PUT',
    expiresAt,
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': record.metadata.contentType },
  }
}

/**
 * Sign a read-only URL for the record's blob. Only uploaded artifacts have bytes
 * to read; the route checks the state first.
 * @param storage - Configured user delegation signer and source container.
 * @param record - Authorized, successfully uploaded artifact whose blob may be read.
 * @returns A read-only GET SAS and its expiry; never log or persist it.
 * @throws When the delegation key cannot be obtained or the reference is invalid.
 */
export async function signDownload(storage: ArtifactStorage, record: ArtifactRecord): Promise<DownloadSas> {
  const { url, expiresAt } = await sign(storage, record, 'r')
  return { url, method: 'GET', expiresAt }
}
