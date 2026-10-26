// Design contracts only; future ownership is documented in implementation.md.
import type { FromSchema } from 'json-schema-to-ts'
import type { schemas } from './artifact-schemas.js'

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
export type ArtifactAction = 'create' | 'read' | 'update'
export type UploadMode = 'create-only' | 'create-or-update'

// Middleware owns this field. HTTP input cannot replace it.
export interface ArtifactEventContext {
  caller: CallerContext
}
export type Result<T, E extends string>
  = | { ok: true, value: T }
    | { ok: false, error: E }

// Context validation only; authentication is upstream.
export type ReadCallerContext = (eventContext: unknown) => Result<CallerContext, 'context_unavailable'>
export type CanAccessArtifact = (caller: CallerContext, reference: ArtifactRef, action: ArtifactAction) => boolean
export interface ArtifactWriteScope {
  creatable: readonly ArtifactRef[]
  updatable: readonly ArtifactRef[]
}
export interface ArtifactAccess extends ArtifactWriteScope {
  readable: readonly ArtifactRef[]
}
// Unknown task => forbidden. Known task with no bindings => empty sets.
export type DeriveArtifactAccess = (caller: CallerContext) => Result<ArtifactAccess, 'forbidden'>

export interface WorkflowStepIdentity {
  runId: string
  stepId: string
}
export interface WorkflowIdentityRepository {
  findStep(stepId: string): Promise<Result<WorkflowStepIdentity, 'not_found' | 'unavailable'>>
}

export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
interface ArtifactBase {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  createdAt: string // UTC ISO instant, fixed on first registration.
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
  uploadedAt: string // Latest accepted acknowledgment time; no history.
}
export type ArtifactRecord = ReservedArtifact | UploadedArtifact
export type MetadataFailure = 'not_found' | 'conflict' | 'unavailable'
export type Completion = Pick<CompleteArtifactRequest, 'sizeBytes' | 'sha256'>

export interface ArtifactMetadataRepository {
  // Atomic insert-or-match by step/name. Immutable descriptive metadata must match.
  // A repeat returns the SAME record/ID, whether reserved or uploaded.
  register(reference: ArtifactRef, metadata: ArtifactMetadata): Promise<Result<{
    record: ArtifactRecord
    created: boolean
  }, MetadataFailure>>
  // Query within trusted reference scope; missing AND foreign IDs => not_found.
  listWithinScope(references: readonly ArtifactRef[]): Promise<Result<ArtifactRecord[], 'unavailable'>>
  findWithinScope(id: string, references: readonly ArtifactRef[]): Promise<Result<ArtifactRecord, 'not_found' | 'unavailable'>>
  // First report needs create; changed report after upload needs update. An exact
  // retry is accepted for create-only callers. Every accepted report refreshes
  // uploadedAt. Scope comes from policy, never HTTP; retain only the latest values.
  acknowledgeWithinScope(id: string, scope: ArtifactWriteScope, completion: Completion): Promise<Result<UploadedArtifact, MetadataFailure>>
}
export interface ArtifactUrlIssuer {
  // Service selects mode from policy. Never issue create-only for an uploaded row.
  issueUpload(record: ArtifactRecord, mode: UploadMode): Promise<Result<UploadSas, 'unavailable'>>
  issueDownload(record: UploadedArtifact): Promise<Result<DownloadSas, 'unavailable'>>
}
export interface ArtifactServiceDependencies {
  identities: WorkflowIdentityRepository
  metadata: ArtifactMetadataRepository
  urls: ArtifactUrlIssuer
  deriveArtifactAccess: DeriveArtifactAccess
}
export type ServiceFailure = 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'internal_error'
export type RegistrationResult
  = | { status: 201, body: NewArtifactResponse }
    | { status: 200, body: CreateArtifactResponse }
export interface ArtifactService {
  // Consume middleware-established context. No execution/attempt identity needed.
  createArtifact(caller: CallerContext, request: CreateArtifactRequest): Promise<Result<RegistrationResult, ServiceFailure>>
  completeArtifact(caller: CallerContext, id: string, request: CompleteArtifactRequest): Promise<Result<CompleteArtifactResponse, ServiceFailure>>
  listArtifacts(caller: CallerContext): Promise<Result<ListArtifactsResponse, ServiceFailure>>
  getArtifact(caller: CallerContext, id: string): Promise<Result<ArtifactInfo, ServiceFailure>>
  getArtifactSas(caller: CallerContext, id: string): Promise<Result<DownloadSas, ServiceFailure>>
}
export type CreateArtifactService = (dependencies: ArtifactServiceDependencies) => ArtifactService
