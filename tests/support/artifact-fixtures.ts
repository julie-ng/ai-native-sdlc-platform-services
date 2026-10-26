// Test-only server-owned contexts. Never import these into production wiring.
import fixture from '../../docs/api/caller-contexts.fixture.json' with { type: 'json' }
import examples from '../../docs/api/examples.json' with { type: 'json' }
import { readCallerContext } from '../../server/utils/artifact/context.utils.ts'
import type { ArtifactRecord, CallerContext } from '../../server/utils/artifact/ports.ts'

export { fixture, examples }
export const contexts: Record<string, CallerContext> = Object.fromEntries(
  Object.entries(fixture.contexts).map(([name, caller]) => {
    const result = readCallerContext({ caller })
    if (!result.ok) {
      throw new Error(`Invalid test context: ${name}`)
    }
    return [name, result.value]
  }),
)

export function artifactRecords(): ArtifactRecord[] {
  return fixture.artifactIdentities.map(({ id, reference }) => ({
    id,
    reference: { ...reference },
    metadata: { contentType: 'text/markdown' },
    state: 'uploaded',
    sizeBytes: 5,
    sha256: '1b4025dc7b8d27cf38df85e77b20ed44a00851a2c28b338560560d85deded8e3',
    createdAt: '2026-10-26T10:00:00Z',
    updatedAt: '2026-10-26T10:01:00Z',
    uploadedAt: '2026-10-26T10:01:00Z',
  }))
}
