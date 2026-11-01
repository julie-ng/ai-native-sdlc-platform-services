import { z } from 'zod'
import {
  contentTypeSchema, descriptionSchema, detailsSchema, nameSchema, sha256Schema,
  sizeBytesSchema, titleSchema, utcInstantSchema, uuidSchema,
} from './common.schema.ts'
import { uploadSasSchema } from './sas.schema.ts'

// reserved: registered, no upload reported. uploaded/failed: the latest upload report.
export const artifactStates = { reserved: 'reserved', uploaded: 'uploaded', failed: 'failed' } as const
export const artifactStateSchema = z.enum(artifactStates)
const descriptiveMetadata = {
  contentType: contentTypeSchema,
  kind: nameSchema.optional(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
}

export const artifactIdParametersSchema = z.strictObject({ id: uuidSchema })

// Public requests never accept producing step ID, permissions or timestamps.
export const createArtifactRequestSchema = z.strictObject({
  name: nameSchema,
  ...descriptiveMetadata,
})
// An upload report: success with the reported size and hash, or failure. Each report
// replaces the previous state, size, hash and details; omitted details are cleared.
export const completeArtifactRequestSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal(artifactStates.uploaded),
    sizeBytes: sizeBytesSchema,
    sha256: sha256Schema,
    details: detailsSchema.optional(),
  }),
  z.strictObject({
    state: z.literal(artifactStates.failed),
    details: detailsSchema.optional(),
  }),
])

// Write permissions do not imply read permissions: acknowledgments exclude
// stored descriptive metadata, producing step ID and timestamps.
export const createArtifactResponseSchema = z.strictObject({
  id: uuidSchema,
  state: artifactStateSchema,
  upload: uploadSasSchema,
})
export const newArtifactResponseSchema = createArtifactResponseSchema.extend({
  state: z.literal(artifactStates.reserved),
})
export const completeArtifactResponseSchema = z.strictObject({
  id: uuidSchema,
  state: z.enum([artifactStates.uploaded, artifactStates.failed]),
})

// updatedAt changes on every accepted write: a repeated POST or a completion report.
const publicMetadata = {
  id: uuidSchema,
  name: nameSchema,
  ...descriptiveMetadata,
  createdAt: utcInstantSchema,
  updatedAt: utcInstantSchema,
}
export const reservedArtifactInfoSchema = z.strictObject({
  ...publicMetadata,
  state: z.literal(artifactStates.reserved),
})
export const uploadedArtifactInfoSchema = z.strictObject({
  ...publicMetadata,
  state: z.literal(artifactStates.uploaded),
  sizeBytes: sizeBytesSchema,
  sha256: sha256Schema,
  details: detailsSchema.optional(),
})
export const failedArtifactInfoSchema = z.strictObject({
  ...publicMetadata,
  state: z.literal(artifactStates.failed),
  details: detailsSchema.optional(),
})
export const artifactInfoSchema = z.discriminatedUnion('state', [
  reservedArtifactInfoSchema,
  uploadedArtifactInfoSchema,
  failedArtifactInfoSchema,
])
export const listArtifactsResponseSchema = z.strictObject({
  artifacts: z.array(artifactInfoSchema),
})
