import {
  uuidSchema, nameSchema, utcInstantSchema, contentTypeSchema,
  sizeBytesSchema, sha256Schema, titleSchema, descriptionSchema,
} from './common.schema.ts'
import { artifactRefSchema, callerContextSchema } from './caller-context.schema.ts'
import {
  artifactIdParametersSchema, createArtifactRequestSchema, completeArtifactRequestSchema,
  createArtifactResponseSchema, completeArtifactResponseSchema, reservedArtifactInfoSchema,
  uploadedArtifactInfoSchema, artifactInfoSchema, listArtifactsResponseSchema, newArtifactResponseSchema,
} from './artifact.schema.ts'
import { uploadSasSchema, downloadSasSchema } from './sas.schema.ts'
import {
  fieldErrorSchema, error400Schema, error403Schema, error404Schema, error405Schema,
  error409Schema, error413Schema, error415Schema, error500Schema, error503Schema, errorResponseSchema,
} from './error.schema.ts'

// Stable public component names connect Zod schemas to generated OpenAPI and
// the checked example corpus. Runtime callers import individual domain schemas.
export const artifactSchemas = {
  Uuid: uuidSchema,
  Name: nameSchema,
  UtcInstant: utcInstantSchema,
  ContentType: contentTypeSchema,
  SizeBytes: sizeBytesSchema,
  Sha256: sha256Schema,
  Title: titleSchema,
  Description: descriptionSchema,
  ArtifactRef: artifactRefSchema,
  CallerContext: callerContextSchema,
  ArtifactIdParameters: artifactIdParametersSchema,
  CreateArtifactRequest: createArtifactRequestSchema,
  CompleteArtifactRequest: completeArtifactRequestSchema,
  UploadSas: uploadSasSchema,
  DownloadSas: downloadSasSchema,
  CreateArtifactResponse: createArtifactResponseSchema,
  CompleteArtifactResponse: completeArtifactResponseSchema,
  ReservedArtifactInfo: reservedArtifactInfoSchema,
  UploadedArtifactInfo: uploadedArtifactInfoSchema,
  ArtifactInfo: artifactInfoSchema,
  ListArtifactsResponse: listArtifactsResponseSchema,
  FieldError: fieldErrorSchema,
  Error400: error400Schema,
  Error403: error403Schema,
  Error404: error404Schema,
  Error405: error405Schema,
  Error409: error409Schema,
  Error413: error413Schema,
  Error415: error415Schema,
  Error500: error500Schema,
  Error503: error503Schema,
  ErrorResponse: errorResponseSchema,
  NewArtifactResponse: newArtifactResponseSchema,
}
export type ArtifactSchemaName = keyof typeof artifactSchemas
