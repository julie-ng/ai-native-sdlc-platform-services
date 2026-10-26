import { mock } from 'node:test'
import type {
  ArtifactMetadataRepository, ArtifactRecord, ArtifactRef, ArtifactUrlIssuer,
  WorkflowIdentityRepository, WorkflowStepIdentity,
} from '../../server/utils/artifact/ports.ts'
import { sameArtifactReference } from '../../server/utils/artifact/policy.utils.ts'

// Focused scope fake, not persistence. Mutation spies deliberately fail until a
// test supplies its own behavior; they never claim an upload or DB write worked.
export function createMetadataFake(records: readonly ArtifactRecord[]) {
  const within = (scope: readonly ArtifactRef[], record: ArtifactRecord) => scope.some(ref => sameArtifactReference(ref, record.reference))
  const metadata = {
    register: mock.fn<ArtifactMetadataRepository['register']>(async () => ({ ok: false, error: 'unavailable' })),
    acknowledgeWithinScope: mock.fn<ArtifactMetadataRepository['acknowledgeWithinScope']>(async () => ({ ok: false, error: 'unavailable' })),
    listWithinScope: mock.fn<ArtifactMetadataRepository['listWithinScope']>(async scope => ({
      ok: true,
      value: structuredClone(records.filter(record => within(scope, record)))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)),
    })),
    findWithinScope: mock.fn<ArtifactMetadataRepository['findWithinScope']>(async (id, scope) => {
      const record = records.find(record => record.id === id && within(scope, record))
      return record ? { ok: true, value: structuredClone(record) } : { ok: false, error: 'not_found' }
    }),
    findReferenceWithinScope: mock.fn<ArtifactMetadataRepository['findReferenceWithinScope']>(async (reference, scope) => {
      const record = records.find(record => sameArtifactReference(record.reference, reference) && within(scope, record))
      return record ? { ok: true, value: structuredClone(record) } : { ok: false, error: 'not_found' }
    }),
  } satisfies ArtifactMetadataRepository
  return metadata
}

// No fake successful SAS: a spy records accidental calls and returns unavailable.
export function createUrlIssuerSpy() {
  return {
    issueUpload: mock.fn<ArtifactUrlIssuer['issueUpload']>(async () => ({ ok: false, error: 'unavailable' })),
    issueDownload: mock.fn<ArtifactUrlIssuer['issueDownload']>(async () => ({ ok: false, error: 'unavailable' })),
  } satisfies ArtifactUrlIssuer
}

export function createWorkflowIdentityFake(steps: readonly WorkflowStepIdentity[]) {
  return {
    findStep: mock.fn<WorkflowIdentityRepository['findStep']>(async (id) => {
      const step = steps.find(step => step.stepId === id)
      return step ? { ok: true, value: { ...step } } : { ok: false, error: 'not_found' }
    }),
  } satisfies WorkflowIdentityRepository
}
