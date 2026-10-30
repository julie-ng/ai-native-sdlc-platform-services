/**
 * Types and ports for the artifact service: access policy, stored records, and the
 * repository and URL-issuer interfaces implemented by the PostgreSQL and Azure
 * adapters (and by fakes in tests). Also re-exports the shared contract types.
 * @module
 */
import type {
  ArtifactRef, CallerContext, CreateArtifactRequest, CompleteArtifactRequest,
  UploadSas, DownloadSas,
} from '../../../shared/types/artifact.ts'

export type * from '../../../shared/types/artifact.ts'

/**
 * Action a caller may be granted on an artifact reference. Create and update stay
 * distinct, mirroring Azure's create (`c`) and write (`w`) SAS permissions, even
 * though the POC planner currently holds both.
 */
export type ArtifactAction = 'create' | 'read' | 'update'

/**
 * References a caller may act on, per action. Derived server-side from the trusted
 * caller context; never supplied by the client.
 */
export interface ArtifactAccess {
  /** Artifacts whose metadata and download SAS the caller may obtain. */
  readable: readonly ArtifactRef[]
  /** Artifacts the caller may register for the first time. */
  creatable: readonly ArtifactRef[]
  /** Artifacts the caller may re-register, overwrite or re-report. */
  updatable: readonly ArtifactRef[]
}
/** Access policy: maps a caller to the references it may read, create and update. */
export type DeriveArtifactAccess = (caller: CallerContext) => ArtifactAccess

/** Descriptive metadata of an artifact: the create request without the slot `name`. */
export type ArtifactMetadata = Omit<CreateArtifactRequest, 'name'>
/** Fields of every stored artifact, regardless of state. */
interface ArtifactBase {
  id: string
  reference: ArtifactRef
  metadata: ArtifactMetadata
  createdAt: string // UTC ISO instant, fixed on first registration.
  updatedAt: string // Refreshed by every accepted write (repeated POST or completion).
}
/** Registered artifact whose upload has not been reported: size and hash are `null`. */
export interface ReservedArtifact extends ArtifactBase {
  state: 'reserved'
  sizeBytes: null
  sha256: null
}
/** Artifact with a reported upload; the size and hash are the latest report. */
export interface UploadedArtifact extends ArtifactBase {
  state: 'uploaded'
  sizeBytes: number
  sha256: string
}
/** Stored artifact, discriminated by `state`. Internal: includes the producing step reference. */
export type ArtifactRecord = ReservedArtifact | UploadedArtifact
/** The size and hash from an upload report. */
export type Completion = Pick<CompleteArtifactRequest, 'sizeBytes' | 'sha256'>

/**
 * Persistence port for artifact metadata. Adapters throw on unexpected failures; the
 * HTTP layer turns those into 500s. Authorization lives in the service, so lookups
 * here are plain.
 */
export interface ArtifactRepository {
  /**
   * Insert, or replace descriptive metadata of the existing step/name record.
   * State, size and hash are kept; SAS URLs are never stored.
   * @param reference - Exact step-owned slot; the step must belong to `reference.runId`.
   * @param metadata - Descriptive metadata; last write wins.
   * @returns The stored record and whether this call created it.
   */
  upsert(reference: ArtifactRef, metadata: ArtifactMetadata): Promise<{ record: ArtifactRecord, created: boolean }>
  /** Look up a record by ID without any access check; returns `undefined` when absent. */
  findById(id: string): Promise<ArtifactRecord | undefined>
  /**
   * Only records matching these exact references, ordered by `createdAt`, then `id`.
   * @param references - Typically the caller's readable references; empty yields an empty list.
   */
  listByReferences(references: readonly ArtifactRef[]): Promise<ArtifactRecord[]>
  /**
   * Replaces the latest size/hash and marks the record `uploaded`; no history is kept.
   * The caller has already checked access.
   * @throws If the record no longer exists.
   */
  acknowledge(id: string, completion: Completion): Promise<UploadedArtifact>
}
/** Port that signs short-lived, single-blob URLs. Never persist or log the results. */
export interface ArtifactUrlIssuer {
  /** Issue an upload (create or overwrite) URL for the record's blob. */
  issueUpload(record: ArtifactRecord): Promise<UploadSas>
  /** Issue a read URL; only uploaded artifacts have bytes to read. */
  issueDownload(record: UploadedArtifact): Promise<DownloadSas>
}
/** Adapters injected into `createArtifactService`. */
export interface ArtifactServiceDependencies {
  repository: ArtifactRepository
  urls: ArtifactUrlIssuer
}

/**
 * Outcome of a service operation, mapped to HTTP by `sendServiceResult`: success with
 * a status and body, or a 403/404/409 failure with a message safe to return.
 */
export type ServiceResult<T>
  = | { ok: true, status: 200 | 201, body: T }
    | { ok: false, status: 403 | 404 | 409, message: string }
