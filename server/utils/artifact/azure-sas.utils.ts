/**
 * Azure Blob Storage adapter that issues the short-lived SAS URLs used for direct
 * uploads and downloads of artifact bytes.
 * @module
 */
import { BlobSASPermissions, generateBlobSASQueryParameters, SASProtocol } from '@azure/storage-blob'
import type { UserDelegationKey } from '@azure/storage-blob'
import type { ArtifactRecord, ArtifactUrlIssuer, UploadedArtifact } from './ports.ts'
import { artifactStorageKey } from './storage-key.utils.ts'

/** Lifetime of every issued SAS URL: 300 seconds (5 minutes). */
export const sasLifetimeSeconds = 300

/**
 * The part of BlobServiceClient this issuer uses. Production passes a client
 * authenticated with the service's own Azure identity; tests pass a fixed key.
 */
export interface UserDelegationKeySource {
  accountName: string
  url: string
  /** Request a key valid from `startsOn` to `expiresOn`; it must cover the SAS lifetime. */
  getUserDelegationKey(startsOn: Date, expiresOn: Date): Promise<UserDelegationKey>
}

/**
 * Issue single-blob, HTTPS-only user delegation SAS URLs. No account keys.
 * Upload uses `w` (create or overwrite) because planners revise their plan;
 * download uses `r`. Never log or persist the returned URLs.
 * @param options - `service` supplies user delegation keys and the account URL;
 * `container` is the blob container that holds all artifacts; `now` is a clock,
 * replaceable in tests (defaults to the current time).
 */
export function createAzureUrlIssuer({ service, container, now = () => new Date() }: {
  service: UserDelegationKeySource
  container: string
  now?: () => Date
}): ArtifactUrlIssuer {
  /**
   * Sign a URL for the record's blob.
   * @param permissions - `r` for download, `w` for upload.
   * @returns The full SAS URL and its expiry as an ISO string.
   */
  async function sign(record: ArtifactRecord, permissions: 'r' | 'w') {
    const startsOn = now()
    const expiresOn = new Date(startsOn.getTime() + sasLifetimeSeconds * 1000)
    // The delegation key must cover the SAS lifetime. The SAS itself omits
    // startsOn so small clock differences cannot make it not-yet-valid.
    const key = await service.getUserDelegationKey(startsOn, expiresOn)
    const blobName = artifactStorageKey(record.reference)
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

  return {
    async issueUpload(record) {
      const { url, expiresAt } = await sign(record, 'w')
      return {
        url,
        method: 'PUT',
        expiresAt,
        headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': record.metadata.contentType },
      }
    },
    async issueDownload(record: UploadedArtifact) {
      const { url, expiresAt } = await sign(record, 'r')
      return { url, method: 'GET', expiresAt }
    },
  }
}
