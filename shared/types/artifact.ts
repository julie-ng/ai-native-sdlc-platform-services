import type { z } from 'zod'
import type { artifactSchemas } from '../utils/zod-schemas/index.ts'

export type ArtifactRef = z.infer<typeof artifactSchemas.ArtifactRef>
export type CallerContext = z.infer<typeof artifactSchemas.CallerContext>
export type CreateArtifactRequest = z.infer<typeof artifactSchemas.CreateArtifactRequest>
export type CompleteArtifactRequest = z.infer<typeof artifactSchemas.CompleteArtifactRequest>
export type CreateArtifactResponse = z.infer<typeof artifactSchemas.CreateArtifactResponse>
export type NewArtifactResponse = z.infer<typeof artifactSchemas.NewArtifactResponse>
export type CompleteArtifactResponse = z.infer<typeof artifactSchemas.CompleteArtifactResponse>
export type ArtifactInfo = z.infer<typeof artifactSchemas.ArtifactInfo>
export type ListArtifactsResponse = z.infer<typeof artifactSchemas.ListArtifactsResponse>
export type UploadSas = z.infer<typeof artifactSchemas.UploadSas>
export type DownloadSas = z.infer<typeof artifactSchemas.DownloadSas>
export type ErrorResponse = z.infer<typeof artifactSchemas.ErrorResponse>
