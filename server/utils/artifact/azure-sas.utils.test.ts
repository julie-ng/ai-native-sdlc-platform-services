import { assert, expect, test, vi } from 'vitest'
import type { UserDelegationKey } from '@azure/storage-blob'
import { planP1, uploadedRecord } from '../../../tests/support/artifact-fixtures.ts'
import { downloadSasSchema, uploadSasSchema } from '../../../shared/utils/zod-schemas/sas.schema.ts'
import { createAzureUrlIssuer } from './azure-sas.utils.ts'
import { artifactStorageKey } from './storage-key.utils.ts'

const now = new Date('2026-10-27T10:00:00.000Z')
// Non-secret test key: offline signing only, not evidence of Azure authorization.
const key: UserDelegationKey = {
  signedObjectId: '00000000-0000-4000-8000-0000000000aa',
  signedTenantId: '00000000-0000-4000-8000-0000000000bb',
  signedStartsOn: now,
  signedExpiresOn: new Date(now.getTime() + 300_000),
  signedService: 'b',
  signedVersion: '2025-01-05',
  value: Buffer.from('test-only-delegation-key').toString('base64'),
}

function setup(url = 'https://account.blob.core.windows.net') {
  const getUserDelegationKey = vi.fn(async () => key)
  const issuer = createAzureUrlIssuer({ service: { accountName: 'account', url, getUserDelegationKey }, container: 'artifacts', now: () => now })
  return { issuer, getUserDelegationKey }
}

test('upload SAS: exact blob, write-only, HTTPS, 300 seconds, no start time', async () => {
  const { issuer, getUserDelegationKey } = setup()
  const record = { ...uploadedRecord('40000000-0000-4000-8000-000000000001', planP1), metadata: { contentType: 'text/plain' } }
  const upload = uploadSasSchema.parse(await issuer.issueUpload(record))
  const url = new URL(upload.url)
  expect(`${url.origin}${url.pathname}`).toBe(`https://account.blob.core.windows.net/artifacts/${artifactStorageKey(planP1)}`)
  expect(Object.fromEntries(['sp', 'sr', 'spr', 'se', 'skoid'].map(name => [name, url.searchParams.get(name)]))).toStrictEqual({
    sp: 'w', sr: 'b', spr: 'https', se: '2026-10-27T10:05:00Z', skoid: key.signedObjectId,
  })
  expect(url.searchParams.has('st')).toBe(false)
  expect(url.searchParams.get('sig')).toBeTruthy()
  expect(upload).toMatchObject({ method: 'PUT', expiresAt: '2026-10-27T10:05:00.000Z', headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'text/plain' } })
  expect(getUserDelegationKey).toHaveBeenCalledWith(now, new Date('2026-10-27T10:05:00.000Z'))
})

test('download SAS is read-only for the same blob', async () => {
  const { issuer } = setup('https://account.blob.core.windows.net/')
  const download = downloadSasSchema.parse(await issuer.issueDownload(uploadedRecord('40000000-0000-4000-8000-000000000001', planP1)))
  const url = new URL(download.url)
  expect(url.pathname).toBe(`/artifacts/${artifactStorageKey(planP1)}`)
  expect(url.searchParams.get('sp')).toBe('r')
  expect(download).not.toHaveProperty('headers')
})

test('delegation key failures and invalid references produce no URL', async () => {
  const { issuer, getUserDelegationKey } = setup()
  getUserDelegationKey.mockRejectedValueOnce(new Error('AuthorizationPermissionMismatch'))
  const record = uploadedRecord('40000000-0000-4000-8000-000000000001', planP1)
  await expect(issuer.issueUpload(record)).rejects.toThrow('AuthorizationPermissionMismatch')
  const invalid = { ...record, reference: { ...planP1, name: '../escape' } }
  const error = await issuer.issueUpload(invalid).catch((error: unknown) => error)
  assert(error instanceof TypeError)
  expect(error.message).toBe('Invalid artifact reference')
})
