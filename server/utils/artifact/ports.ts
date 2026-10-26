import type {
  ArtifactRef, CallerContext, CreateArtifactRequest, CompleteArtifactRequest,
  CreateArtifactResponse, NewArtifactResponse, CompleteArtifactResponse,
  ArtifactInfo, ListArtifactsResponse, UploadSas, DownloadSas,
} from '../../../shared/types/artifact.ts'

export type * from '../../../shared/types/artifact.ts'

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
// A false action check alone does not choose HTTP status; first establish
// any-action visibility and existence, then map wrong permission to 403.
export type CanAccessArtifact = (caller: CallerContext, reference: ArtifactRef, action: ArtifactAction) => boolean
export interface ArtifactWriteScope {
  creatable: readonly ArtifactRef[]
  updatable: readonly ArtifactRef[]
}
export interface ArtifactAccess extends ArtifactWriteScope {
  readable: readonly ArtifactRef[]
}
// Unknown tasks and ungranted bindings yield empty sets: no existence disclosure.
// Visibility is the de-duplicated union of all three effective grant sets.
export type DeriveArtifactAccess = (caller: CallerContext) => ArtifactAccess

// Persisted workflow record IDs for step/run consistency, not authentication.
export interface WorkflowStepReference {
  runId: string
  stepId: string
}
export interface WorkflowStepLookup {
  findStep(stepId: string): Promise<Result<WorkflowStepReference, 'not_found' | 'unavailable'>>
}

export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
interface ArtifactBase {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  createdAt: string // UTC ISO instant, fixed on first registration.
  updatedAt: string // Same initial instant; refreshed by each accepted acknowledgment.
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
export type MetadataFailure = 'not_found' | 'forbidden' | 'conflict' | 'unavailable'
export type Completion = Pick<CompleteArtifactRequest, 'sizeBytes' | 'sha256'>

export interface ArtifactMetadataRepository {
  // Atomic insert-or-match by step/name. Immutable descriptive metadata must match.
  // A repeat returns the SAME record/ID, whether reserved or uploaded.
  register(reference: ArtifactRef, metadata: ArtifactMetadata): Promise<Result<{
    record: ArtifactRecord
    created: boolean
  }, MetadataFailure>>
  // Discovery receives readable scope only. ID/reference lookups receive the union
  // of all action scopes; missing OR no access => not_found. The service then
  // checks the requested action on a found row, returning forbidden if needed.
  listWithinScope(readable: readonly ArtifactRef[]): Promise<Result<ArtifactRecord[], 'unavailable'>>
  findWithinScope(id: string, visible: readonly ArtifactRef[]): Promise<Result<ArtifactRecord, 'not_found' | 'unavailable'>>
  findReferenceWithinScope(reference: ArtifactRef, visible: readonly ArtifactRef[]): Promise<Result<ArtifactRecord, 'not_found' | 'unavailable'>>
  // First report needs create; changed report after upload needs update. An exact
  // retry is accepted for create-only callers. Every accepted report refreshes
  // uploadedAt and updatedAt using one DB instant. Existing accessible rows that
  // need an ungranted update return forbidden; no history is retained.
  acknowledgeWithinScope(id: string, scope: ArtifactWriteScope, completion: Completion): Promise<Result<UploadedArtifact, MetadataFailure>>
}
export interface ArtifactUrlIssuer {
  // Service selects mode from policy. Never issue create-only for an uploaded row.
  issueUpload(record: ArtifactRecord, mode: UploadMode): Promise<Result<UploadSas, 'unavailable'>>
  issueDownload(record: UploadedArtifact): Promise<Result<DownloadSas, 'unavailable'>>
}
export interface ArtifactServiceDependencies {
  workflowSteps: WorkflowStepLookup
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
