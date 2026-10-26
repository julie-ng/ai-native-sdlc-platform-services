// Design contracts only. Future ownership: shared/types/artifact.ts and
// server/utils/artifact/ports.ts, as described in README.md. No implementation.
import type { FromSchema } from 'json-schema-to-ts'
import type { schemas } from './artifact-schemas.js'

export type ArtifactRef = FromSchema<typeof schemas.ArtifactRef>
export type CreateUploadRequest = FromSchema<typeof schemas.CreateUploadRequest>
export type AcknowledgeUploadRequest = FromSchema<typeof schemas.AcknowledgeUploadRequest>
export type ReadDownloadRequest = FromSchema<typeof schemas.ReadDownloadRequest>
export type CreateUploadResponse = FromSchema<typeof schemas.CreateUploadResponse>
export type AcknowledgeUploadResponse = FromSchema<typeof schemas.AcknowledgeUploadResponse>
export type ReadDownloadResponse = FromSchema<typeof schemas.ReadDownloadResponse>
export type UploadAuthorization = FromSchema<typeof schemas.UploadAuthorization>
export type DownloadAuthorization = FromSchema<typeof schemas.DownloadAuthorization>
export type ErrorResponse = FromSchema<typeof schemas.ErrorResponse>
export type ArtifactAction = 'create' | 'read' | 'update'

export type Assignment = FromSchema<typeof schemas.Assignment>

export type Result<T, E extends string>
  = | { ok: true, value: T }
    | { ok: false, error: E }

export interface AssignmentResolver {
  // Undefined, absent or unknown credentials fail closed. No policy from HTTP.
  resolve(credential: string | undefined): Promise<Result<Assignment, 'unauthenticated' | 'unavailable'>>
}

export type CreateRejectingAssignmentResolver = () => AssignmentResolver
// The factory also checks NODE_ENV=test; never called by the default application.
export type CreateFixtureAssignmentResolver = (
  assignments: Readonly<Record<string, Assignment>>,
) => AssignmentResolver
export type CanAccessArtifact = (
  assignment: Assignment,
  reference: ArtifactRef,
  action: ArtifactAction,
) => boolean

export interface WorkflowIdentity {
  runId: string
  stepId: string
  attemptId: string
}

export interface WorkflowIdentityRepository {
  // Workflow-owned lookup. Service compares all three IDs to requested reference.
  findAttempt(attemptId: string): Promise<Result<WorkflowIdentity, 'not_found' | 'unavailable'>>
}

interface ArtifactBase {
  id: string
  reference: ArtifactRef
  contentType: string
  kind: string | null
  createdAt: string // UTC ISO instant; no Date objects cross ports.
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
export type MetadataFailure = 'not_found' | 'forbidden' | 'conflict' | 'unavailable'
export type Completion = Pick<AcknowledgeUploadRequest, 'sizeBytes' | 'sha256'>

export interface ArtifactMetadataRepository {
  // Authorized, linkage-verified own reference; kind omission becomes null.
  // Atomic insert-or-match. Existing uploaded or different metadata => conflict.
  reserve(input: CreateUploadRequest): Promise<Result<{
    record: ReservedArtifact
    created: boolean
  }, MetadataFailure>>
  // Lookup joins producer identity so wrong run/step cannot alias another row.
  find(reference: ArtifactRef): Promise<Result<ArtifactRecord, MetadataFailure>>
  // Atomic compare/transition. Identical repeat returns unchanged uploaded row.
  acknowledge(reference: ArtifactRef, completion: Completion): Promise<Result<UploadedArtifact, MetadataFailure>>
}

export interface ArtifactUrlIssuer {
  // Issuer derives key from record.reference. Fixed 300-second lifetime; no caller TTL.
  issueUpload(record: ReservedArtifact): Promise<Result<UploadAuthorization, 'unavailable'>>
  issueDownload(record: UploadedArtifact): Promise<Result<DownloadAuthorization, 'unavailable'>>
}

export interface ArtifactServiceDependencies {
  assignments: AssignmentResolver
  identities: WorkflowIdentityRepository
  metadata: ArtifactMetadataRepository
  urls: ArtifactUrlIssuer
  canAccessArtifact: CanAccessArtifact
}

export type ServiceFailure
  = | 'unauthenticated'
    | 'forbidden'
    | 'not_found'
    | 'conflict'
    | 'unavailable'
    | 'internal_error'

export interface ArtifactService {
  resolveCaller(credential: string | undefined): Promise<Result<Assignment, 'unauthenticated' | 'unavailable'>>
  // HTTP layer validates unknown input before calling these typed methods.
  // Credential resolution must precede payload error disclosure in the handler.
  createUpload(assignment: Assignment, request: CreateUploadRequest): Promise<Result<{
    status: 200 | 201
    body: CreateUploadResponse
  }, ServiceFailure>>
  acknowledgeUpload(assignment: Assignment, request: AcknowledgeUploadRequest): Promise<Result<AcknowledgeUploadResponse, ServiceFailure>>
  readDownload(assignment: Assignment, request: ReadDownloadRequest): Promise<Result<ReadDownloadResponse, ServiceFailure>>
}

export type CreateArtifactService = (dependencies: ArtifactServiceDependencies) => ArtifactService
