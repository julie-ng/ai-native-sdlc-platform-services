import type { FromSchema } from 'json-schema-to-ts'
import type { schemas } from '../utils/artifact-schemas/schemas.ts'

export type ArtifactRef = FromSchema<typeof schemas.ArtifactRef>
export type CallerContext = FromSchema<typeof schemas.CallerContext>
export type CreateArtifactRequest = FromSchema<typeof schemas.CreateArtifactRequest>
export type CompleteArtifactRequest = FromSchema<typeof schemas.CompleteArtifactRequest>
export type CreateArtifactResponse = FromSchema<typeof schemas.CreateArtifactResponse>
export type NewArtifactResponse = FromSchema<typeof schemas.NewArtifactResponse>
export type CompleteArtifactResponse = FromSchema<typeof schemas.CompleteArtifactResponse>
export type ArtifactInfo = FromSchema<typeof schemas.ArtifactInfo>
export type ListArtifactsResponse = FromSchema<typeof schemas.ListArtifactsResponse>
export type UploadSas = FromSchema<typeof schemas.UploadSas>
export type DownloadSas = FromSchema<typeof schemas.DownloadSas>
export type ErrorResponse = FromSchema<typeof schemas.ErrorResponse>
