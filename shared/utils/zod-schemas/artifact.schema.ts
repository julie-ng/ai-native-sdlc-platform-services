import { z } from 'zod'
import {
  contentTypeSchema, descriptionSchema, nameSchema, sha256Schema,
  sizeBytesSchema, titleSchema, utcInstantSchema, uuidSchema,
} from './common.schema.ts'
import { uploadSasSchema } from './sas.schema.ts'

export const artifactStates = { reserved: 'reserved', uploaded: 'uploaded' } as const
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
export const completeArtifactRequestSchema = z.strictObject({
  state: z.literal(artifactStates.uploaded),
  sizeBytes: sizeBytesSchema,
  sha256: sha256Schema,
})

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
  state: z.literal(artifactStates.uploaded),
})

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
  uploadedAt: utcInstantSchema,
})
export const artifactInfoSchema = z.discriminatedUnion('state', [reservedArtifactInfoSchema, uploadedArtifactInfoSchema])
export const listArtifactsResponseSchema = z.strictObject({
  artifacts: z.array(artifactInfoSchema).max(128),
})
