import { createRunResponseSchema } from './run.schema.ts'
import {
  uuidSchema, nameSchema, utcInstantSchema, contentTypeSchema,
  sizeBytesSchema, sha256Schema, titleSchema, descriptionSchema, detailsSchema,
} from './common.schema.ts'
import { artifactRefSchema, stepContextSchema } from './step-context.schema.ts'
import {
  artifactIdParametersSchema, createArtifactRequestSchema, completeArtifactRequestSchema,
  createArtifactResponseSchema, completeArtifactResponseSchema, reservedArtifactInfoSchema,
  uploadedArtifactInfoSchema, failedArtifactInfoSchema, artifactInfoSchema, listArtifactsResponseSchema, newArtifactResponseSchema,
} from './artifact.schema.ts'
import { uploadSasSchema, downloadSasSchema } from './sas.schema.ts'
import { errorResponseSchema } from './error.schema.ts'

// Stable public component names connect Zod schemas to generated OpenAPI.
// Runtime callers import individual domain schemas.
export const artifactSchemas = {
  CreateRunResponse: createRunResponseSchema,
  Uuid: uuidSchema,
  Name: nameSchema,
  UtcInstant: utcInstantSchema,
  ContentType: contentTypeSchema,
  SizeBytes: sizeBytesSchema,
  Sha256: sha256Schema,
  Title: titleSchema,
  Description: descriptionSchema,
  Details: detailsSchema,
  ArtifactRef: artifactRefSchema,
  StepContext: stepContextSchema,
  ArtifactIdParameters: artifactIdParametersSchema,
  CreateArtifactRequest: createArtifactRequestSchema,
  CompleteArtifactRequest: completeArtifactRequestSchema,
  UploadSas: uploadSasSchema,
  DownloadSas: downloadSasSchema,
  CreateArtifactResponse: createArtifactResponseSchema,
  CompleteArtifactResponse: completeArtifactResponseSchema,
  ReservedArtifactInfo: reservedArtifactInfoSchema,
  UploadedArtifactInfo: uploadedArtifactInfoSchema,
  FailedArtifactInfo: failedArtifactInfoSchema,
  ArtifactInfo: artifactInfoSchema,
  ListArtifactsResponse: listArtifactsResponseSchema,
  ErrorResponse: errorResponseSchema,
  NewArtifactResponse: newArtifactResponseSchema,
}
export type ArtifactSchemaName = keyof typeof artifactSchemas
