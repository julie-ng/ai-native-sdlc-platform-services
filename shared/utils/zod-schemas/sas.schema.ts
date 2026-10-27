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

// The POC has one writer policy: create or overwrite the caller's own plan.
export const uploadSasSchema = z.strictObject({
  ...uploadShape,
  headers: z.strictObject({
    'x-ms-blob-type': z.literal('BlockBlob'),
    'Content-Type': contentTypeSchema,
  }),
})
export const downloadSasSchema = z.strictObject({
  url: sasUrlSchema,
  method: z.literal('GET'),
  expiresAt: utcInstantSchema,
})
