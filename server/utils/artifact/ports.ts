import type {
  ArtifactRef, CallerContext, CreateArtifactRequest, CompleteArtifactRequest,
  UploadSas, DownloadSas,
} from '../../../shared/types/artifact.ts'

export type * from '../../../shared/types/artifact.ts'

// Create and update stay distinct, mirroring Azure's create (`c`) and write (`w`)
// SAS permissions, even though the POC planner currently holds both.
export type ArtifactAction = 'create' | 'read' | 'update'

export interface ArtifactAccess {
  readable: readonly ArtifactRef[]
  creatable: readonly ArtifactRef[]
  updatable: readonly ArtifactRef[]
}
export type DeriveArtifactAccess = (caller: CallerContext) => ArtifactAccess

export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
interface ArtifactBase {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  createdAt: string // UTC ISO instant, fixed on first registration.
  updatedAt: string // Refreshed by every accepted write (repeated POST or completion).
}
export interface ReservedArtifact extends ArtifactBase {
  state: 'reserved'
  sizeBytes: null
  sha256: null
}
export interface UploadedArtifact extends ArtifactBase {
  state: 'uploaded'
  sizeBytes: number
  sha256: string
}
export type ArtifactRecord = ReservedArtifact | UploadedArtifact
export type Completion = Pick<CompleteArtifactRequest, 'sizeBytes' | 'sha256'>

// Adapters throw on unexpected failures; the HTTP layer turns those into 500s.
// Authorization lives in the service, so lookups here are plain.
export interface ArtifactRepository {
  // Insert, or replace descriptive metadata of the existing step/name record.
  // State, size and hash are kept; SAS URLs are never stored.
  upsert(reference: ArtifactRef, metadata: ArtifactMetadata): Promise<{ record: ArtifactRecord, created: boolean }>
  findById(id: string): Promise<ArtifactRecord | undefined>
  // Only records matching these exact references, ordered by createdAt, then id.
  listByReferences(references: readonly ArtifactRef[]): Promise<ArtifactRecord[]>
  // Replaces the latest size/hash; no history. The caller has already checked access.
  acknowledge(id: string, completion: Completion): Promise<UploadedArtifact>
}
export interface ArtifactUrlIssuer {
  issueUpload(record: ArtifactRecord): Promise<UploadSas>
  issueDownload(record: UploadedArtifact): Promise<DownloadSas>
}
export interface ArtifactServiceDependencies {
  repository: ArtifactRepository
  urls: ArtifactUrlIssuer
}

export type ServiceResult<T>
  = | { ok: true, status: 200 | 201, body: T }
    | { ok: false, status: 403 | 404 | 409, message: string }
