import assert from 'node:assert/strict'
import { test } from 'node:test'
import { uploadSasSchema, downloadSasSchema } from './sas.schema.ts'

const upload = {
  url: 'https://example.blob.core.windows.net/artifacts/plan?sp=w&sig=DOCUMENTATION-ONLY',
  method: 'PUT',
  expiresAt: '2026-10-27T10:05:00Z',
  headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'text/markdown' },
}

test('upload instructions allow overwrites and reject conditional create-only headers', () => {
  assert(uploadSasSchema.safeParse(upload).success)
  assert(!uploadSasSchema.safeParse({ ...upload, headers: { ...upload.headers, 'If-None-Match': '*' } }).success)
  assert(!uploadSasSchema.safeParse({ ...upload, method: 'GET' }).success)
})

test('download instructions exclude upload headers and require HTTPS', () => {
  const download = { url: upload.url.replace('sp=w', 'sp=r'), method: 'GET', expiresAt: upload.expiresAt }
  assert(downloadSasSchema.safeParse(download).success)
  assert(!downloadSasSchema.safeParse({ ...download, headers: upload.headers }).success)
  assert(!downloadSasSchema.safeParse({ ...download, url: 'http://example.com/blob?sp=r' }).success)
})
