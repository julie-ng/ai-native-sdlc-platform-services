/**
 * Artifact service: applies the access policy and orchestrates the repository and
 * URL issuer. Contains no HTTP concerns; routes translate its results.
 * @module
 */
import type {
  ArtifactAction, ArtifactInfo, ArtifactRecord, ArtifactServiceDependencies, CallerContext,
  CompleteArtifactRequest, CompleteArtifactResponse, CreateArtifactRequest, CreateArtifactResponse,
  DownloadSas, ListArtifactsResponse, ServiceResult,
} from './ports.ts'
import { canAccessArtifact, deriveArtifactAccess, isArtifactVisible } from './policy.utils.ts'

/** 404 for missing and invisible artifacts alike, so IDs reveal nothing. */
const notFound = { ok: false, status: 404, message: 'Artifact not found' } as const
/** 403 for a visible artifact on which the caller lacks the requested action. */
const forbidden = { ok: false, status: 403, message: 'Forbidden' } as const

/**
 * Project a stored record onto its public metadata. Select public fields explicitly;
 * internal references and SAS URLs never leave. Absent optional fields are omitted.
 */
function toArtifactInfo(record: ArtifactRecord): ArtifactInfo {
  const { contentType, kind, title, description } = record.metadata
  const common = {
    id: record.id,
    name: record.reference.name,
    contentType,
    ...(kind === undefined ? {} : { kind }),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  return record.state === 'uploaded'
    ? { ...common, state: 'uploaded', sizeBytes: record.sizeBytes, sha256: record.sha256 }
    : { ...common, state: 'reserved' }
}

/**
 * Artifact operations for a caller already established by requireCallerContext.
 *
 * Missing or invisible artifacts are 404, so IDs reveal nothing. A visible
 * artifact with the wrong action is 403. Adapters may throw; routes report 500.
 * @param dependencies - Repository and URL-issuer adapters.
 * @returns The five operations behind the artifact routes. Each takes the trusted
 * caller as its first argument and returns a {@link ServiceResult}.
 */
export function createArtifactService({ repository, urls }: ArtifactServiceDependencies) {
  /**
   * Look up a record and authorize the caller for one action on it.
   * @param action - Chooses the required action from the record, e.g. by its state.
   * @returns The record, or 404 (missing or invisible) / 403 (visible, action not granted).
   */
  async function findFor(caller: CallerContext, id: string, action: (record: ArtifactRecord) => ArtifactAction) {
    const record = await repository.findById(id)
    if (!record || !isArtifactVisible(caller, record.reference)) {
      return notFound
    }
    if (!canAccessArtifact(caller, record.reference, action(record))) {
      return forbidden
    }
    return { ok: true, record } as const
  }

  return {
    /**
     * Register, or re-register, the caller's own artifact and issue an upload SAS.
     * The producing step comes from the caller, never the request body.
     * @returns 201 when newly registered, 200 when it already existed; 404 or 403 when
     * the caller may not create and update this slot.
     */
    async createArtifact(caller: CallerContext, { name, ...metadata }: CreateArtifactRequest): Promise<ServiceResult<CreateArtifactResponse>> {
      const reference = { runId: caller.runId, producerStepId: caller.stepId, name }
      if (!isArtifactVisible(caller, reference)) {
        return notFound
      }
      // The upload SAS can overwrite (`sp=w`), so it needs both permissions.
      if (!canAccessArtifact(caller, reference, 'create') || !canAccessArtifact(caller, reference, 'update')) {
        return forbidden
      }
      const { record, created } = await repository.upsert(reference, metadata)
      // If signing fails the registration stays; a repeated POST signs again.
      const upload = await urls.issueUpload(record)
      return { ok: true, status: created ? 201 : 200, body: { id: record.id, state: record.state, upload } }
    },

    /**
     * Record the caller's report of a finished upload. Size and hash are reported, not
     * verified. Each report replaces the previous one.
     * @returns 200 with the ID and `uploaded` state; 404 or 403 when not permitted.
     */
    async completeArtifact(caller: CallerContext, id: string, { sizeBytes, sha256 }: CompleteArtifactRequest): Promise<ServiceResult<CompleteArtifactResponse>> {
      // The first report creates the uploaded content; later reports replace it.
      const found = await findFor(caller, id, record => record.state === 'reserved' ? 'create' : 'update')
      if (!found.ok) {
        return found
      }
      const record = await repository.acknowledge(id, { sizeBytes, sha256 })
      return { ok: true, status: 200, body: { id: record.id, state: record.state } }
    },

    /** List metadata of the artifacts the caller may read. Never issues SAS URLs. */
    async listArtifacts(caller: CallerContext): Promise<ServiceResult<ListArtifactsResponse>> {
      const records = await repository.listByReferences(deriveArtifactAccess(caller).readable)
      return { ok: true, status: 200, body: { artifacts: records.map(toArtifactInfo) } }
    },

    /** Read one artifact's metadata. Never issues SAS URLs. 404 or 403 when not permitted. */
    async getArtifact(caller: CallerContext, id: string): Promise<ServiceResult<ArtifactInfo>> {
      const found = await findFor(caller, id, () => 'read')
      if (!found.ok) {
        return found
      }
      return { ok: true, status: 200, body: toArtifactInfo(found.record) }
    },

    /**
     * Issue a just-in-time download SAS for a readable artifact.
     * @returns 200 with the SAS; 409 until an upload has been reported; 404 or 403
     * when not permitted.
     */
    async getArtifactSas(caller: CallerContext, id: string): Promise<ServiceResult<DownloadSas>> {
      const found = await findFor(caller, id, () => 'read')
      if (!found.ok) {
        return found
      }
      if (found.record.state !== 'uploaded') {
        return { ok: false, status: 409, message: 'Artifact upload has not been reported' }
      }
      return { ok: true, status: 200, body: await urls.issueDownload(found.record) }
    },
  }
}

/** The artifact service returned by {@link createArtifactService}. */
export type ArtifactService = ReturnType<typeof createArtifactService>
