import { z } from 'zod'
import { contentTypeSchema, utcInstantSchema } from './common.schema.ts'

// A URL selects one HTTPS blob and carries a query capability. It is never
// persisted in metadata or returned by discovery/metadata responses.
const sasUrlSchema = z.url().regex(/^https:\/\/[^/?#]+\/[^?#]+\?[^#]+$/)
const uploadShape = {
  url: sasUrlSchema,
  method: z.literal('PUT'),
  expiresAt: utcInstantSchema,
}

export const createOnlyUploadSasSchema = z.strictObject({
  ...uploadShape,
  headers: z.strictObject({
    'x-ms-blob-type': z.literal('BlockBlob'),
    'If-None-Match': z.literal('*'),
    'Content-Type': contentTypeSchema,
  }),
})
export const writableUploadSasSchema = z.strictObject({
  ...uploadShape,
  headers: z.strictObject({
    'x-ms-blob-type': z.literal('BlockBlob'),
    'Content-Type': contentTypeSchema,
  }),
})
export const uploadSasSchema = z.union([createOnlyUploadSasSchema, writableUploadSasSchema])
export const downloadSasSchema = z.strictObject({
  url: sasUrlSchema,
  method: z.literal('GET'),
  expiresAt: utcInstantSchema,
})
