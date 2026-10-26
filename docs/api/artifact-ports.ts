// Design contracts only; future ownership is documented in README.md.
import type { FromSchema } from 'json-schema-to-ts'
import type { schemas } from './artifact-schemas.js'

export type ArtifactRef = FromSchema<typeof schemas.ArtifactRef>
export type CallerContext = FromSchema<typeof schemas.CallerContext>
export type CreateArtifactRequest = FromSchema<typeof schemas.CreateArtifactRequest>
export type CompleteArtifactRequest = FromSchema<typeof schemas.CompleteArtifactRequest>
export type CreateArtifactResponse = FromSchema<typeof schemas.CreateArtifactResponse>
export type CompleteArtifactResponse = FromSchema<typeof schemas.CompleteArtifactResponse>
export type ArtifactInfo = FromSchema<typeof schemas.ArtifactInfo>
export type ListArtifactsResponse = FromSchema<typeof schemas.ListArtifactsResponse>
export type UploadSas = FromSchema<typeof schemas.UploadSas>
export type DownloadSas = FromSchema<typeof schemas.DownloadSas>
export type ErrorResponse = FromSchema<typeof schemas.ErrorResponse>
export type ArtifactAction = 'create' | 'read' | 'update'

// Middleware owns this field. The HTTP body/query/headers cannot replace it.
export interface ArtifactEventContext {
  caller: CallerContext
}

export type Result<T, E extends string>
  = | { ok: true, value: T }
    | { ok: false, error: E }

// Validate the middleware field and fail closed; no authentication or token work.
export type ReadCallerContext = (eventContext: unknown) => Result<CallerContext, 'context_unavailable'>
export type CanAccessArtifact = (caller: CallerContext, reference: ArtifactRef, action: ArtifactAction) => boolean
export interface ArtifactAccess {
  readable: readonly ArtifactRef[]
  creatable: readonly ArtifactRef[]
}
// Unknown task => forbidden. Known task with no bindings => empty sets.
export type DeriveArtifactAccess = (caller: CallerContext) => Result<ArtifactAccess, 'forbidden'>

export interface WorkflowIdentity {
  runId: string
  stepId: string
  attemptId: string
}
export interface WorkflowIdentityRepository {
  findAttempt(attemptId: string): Promise<Result<WorkflowIdentity, 'not_found' | 'unavailable'>>
}

export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
interface ArtifactBase {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  createdAt: string // UTC ISO instant at adapter boundaries.
}
export interface ReservedArtifact extends ArtifactBase {
  state: 'reserved'
  sizeBytes: null
  sha256: null
  uploadedAt: null
}
export interface UploadedArtifact extends ArtifactBase {
  state: 'uploaded'
  sizeBytes: number
  sha256: string
  uploadedAt: string
}
export type ArtifactRecord = ReservedArtifact | UploadedArtifact
export type MetadataFailure = 'not_found' | 'conflict' | 'unavailable'
export type Completion = Pick<CompleteArtifactRequest, 'sizeBytes' | 'sha256'>

export interface ArtifactMetadataRepository {
  // reference comes from the caller's trusted own-output binding, never HTTP IDs.
  reserve(reference: ArtifactRef, metadata: ArtifactMetadata): Promise<Result<{
    record: ReservedArtifact
    created: boolean
  }, MetadataFailure>>
  // These operations constrain the query to authorized references before lookup.
  // Missing AND foreign IDs both return not_found. No unrestricted findById port.
  listWithinScope(references: readonly ArtifactRef[]): Promise<Result<ArtifactRecord[], 'unavailable'>>
  findWithinScope(id: string, references: readonly ArtifactRef[]): Promise<Result<ArtifactRecord, 'not_found' | 'unavailable'>>
  // Atomic transition or identical repeat, constrained to creatable own outputs.
  acknowledgeWithinScope(id: string, ownOutputs: readonly ArtifactRef[], completion: Completion): Promise<Result<UploadedArtifact, MetadataFailure>>
}
export interface ArtifactUrlIssuer {
  issueUpload(record: ReservedArtifact): Promise<Result<UploadSas, 'unavailable'>>
  issueDownload(record: UploadedArtifact): Promise<Result<DownloadSas, 'unavailable'>>
}
export interface ArtifactServiceDependencies {
  identities: WorkflowIdentityRepository
  metadata: ArtifactMetadataRepository
  urls: ArtifactUrlIssuer
  deriveArtifactAccess: DeriveArtifactAccess
}
export type ServiceFailure = 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'internal_error'
export interface ArtifactService {
  // Only middleware-established context reaches these methods. No authN adapter.
  createArtifact(caller: CallerContext, request: CreateArtifactRequest): Promise<Result<{
    status: 200 | 201
    body: CreateArtifactResponse
  }, ServiceFailure>>
  completeArtifact(caller: CallerContext, id: string, request: CompleteArtifactRequest): Promise<Result<CompleteArtifactResponse, ServiceFailure>>
  listArtifacts(caller: CallerContext): Promise<Result<ListArtifactsResponse, ServiceFailure>>
  getArtifact(caller: CallerContext, id: string): Promise<Result<ArtifactInfo, ServiceFailure>>
  getArtifactSas(caller: CallerContext, id: string): Promise<Result<DownloadSas, ServiceFailure>>
}
export type CreateArtifactService = (dependencies: ArtifactServiceDependencies) => ArtifactService
