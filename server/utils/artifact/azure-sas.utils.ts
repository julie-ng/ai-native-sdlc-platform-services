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
  /** Request a key valid from `startsOn` to `expiresOn`; it must cover the SAS lifetime. */
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
 * @throws When the delegation key cannot be obtained or the reference is invalid.
 */
export async function signDownload(storage: ArtifactStorage, record: ArtifactRecord): Promise<DownloadSas> {
  const { url, expiresAt } = await sign(storage, record, 'r')
  return { url, method: 'GET', expiresAt }
}
