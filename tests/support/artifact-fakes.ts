import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { ArtifactRecord, ArtifactRepository, ArtifactUrlIssuer } from '../../server/utils/artifact/ports.ts'
import { sameArtifactReference } from '../../server/utils/artifact/policy.utils.ts'
import { artifactStorageKey } from '../../server/utils/artifact/storage-key.utils.ts'

// In-memory stand-in for service tests only. PostgreSQL behavior (constraints,
// timestamps, durability) is proven by tests/integration against a real database.
export function createInMemoryRepository(seed: readonly ArtifactRecord[] = []) {
  const records = structuredClone([...seed])
  let tick = 0
  const now = () => new Date(Date.UTC(2026, 9, 27, 10, 0, tick++)).toISOString()
  const repository = {
    upsert: vi.fn<ArtifactRepository['upsert']>(async (reference, metadata) => {
      const existing = records.find(record => sameArtifactReference(record.reference, reference))
      if (existing) {
        Object.assign(existing, { metadata: { ...metadata }, updatedAt: now() })
        return { record: structuredClone(existing), created: false }
      }
      const at = now()
      const record: ArtifactRecord = {
        id: randomUUID(), reference: { ...reference }, metadata: { ...metadata },
        state: 'reserved', sizeBytes: null, sha256: null, createdAt: at, updatedAt: at,
      }
      records.push(record)
      return { record: structuredClone(record), created: true }
    }),
    findById: vi.fn<ArtifactRepository['findById']>(async id => structuredClone(records.find(record => record.id === id))),
    listByReferences: vi.fn<ArtifactRepository['listByReferences']>(async references => structuredClone(
      records.filter(record => references.some(ref => sameArtifactReference(ref, record.reference)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    )),
    acknowledge: vi.fn<ArtifactRepository['acknowledge']>(async (id, completion) => {
      const index = records.findIndex(record => record.id === id)
      if (index === -1) {
        throw new Error('Unknown artifact')
      }
      const uploaded = { ...records[index]!, ...completion, state: 'uploaded' as const, updatedAt: now() }
      records[index] = uploaded
      return structuredClone(uploaded)
    }),
  } satisfies ArtifactRepository
  return { repository, records }
}

// Spy issuer with visibly fake URLs. Never evidence of an Azure handoff.
export function createUrlIssuerSpy() {
  const url = (record: ArtifactRecord, sp: string) => `https://fake.blob.core.windows.net/artifacts/${artifactStorageKey(record.reference)}?sp=${sp}&sig=TEST-ONLY`
  return {
    issueUpload: vi.fn<ArtifactUrlIssuer['issueUpload']>(async record => ({
      url: url(record, 'w'),
      method: 'PUT',
      expiresAt: '2026-10-27T10:05:00.000Z',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': record.metadata.contentType },
    })),
    issueDownload: vi.fn<ArtifactUrlIssuer['issueDownload']>(async record => ({
      url: url(record, 'r'),
      method: 'GET',
      expiresAt: '2026-10-27T10:05:00.000Z',
    })),
  } satisfies ArtifactUrlIssuer
}
