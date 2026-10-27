import { expect, test } from 'vitest'
import { uploadSasSchema, downloadSasSchema } from './sas.schema.ts'

const upload = {
  url: 'https://example.blob.core.windows.net/artifacts/plan?sp=w&sig=DOCUMENTATION-ONLY',
  method: 'PUT',
  expiresAt: '2026-10-27T10:05:00Z',
  headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'text/markdown' },
}

test('upload instructions allow overwrites and reject conditional create-only headers', () => {
  expect(uploadSasSchema.safeParse(upload).success).toBe(true)
  expect(uploadSasSchema.safeParse({ ...upload, headers: { ...upload.headers, 'If-None-Match': '*' } }).success).toBe(false)
  expect(uploadSasSchema.safeParse({ ...upload, method: 'GET' }).success).toBe(false)
})

test('download instructions exclude upload headers and require HTTPS', () => {
  const download = { url: upload.url.replace('sp=w', 'sp=r'), method: 'GET', expiresAt: upload.expiresAt }
  expect(downloadSasSchema.safeParse(download).success).toBe(true)
  expect(downloadSasSchema.safeParse({ ...download, headers: upload.headers }).success).toBe(false)
  expect(downloadSasSchema.safeParse({ ...download, url: 'http://example.com/blob?sp=r' }).success).toBe(false)
})
