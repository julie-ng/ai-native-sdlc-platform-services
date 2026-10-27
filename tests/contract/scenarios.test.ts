import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { examples, fixtures, loadArtifactContract } from './support/artifact-contract.utils.ts'

let contract: Awaited<ReturnType<typeof loadArtifactContract>>
before(async () => {
  contract = await loadArtifactContract()
})

// Static consistency of authored narratives, not runtime policy/HTTP evidence.
for (const example of examples.accessCases) {
  test(`documented visibility/action outcome: ${example.id}`, () => {
    const operation = contract.request(example)
    const response = operation.responses[String(example.expectedStatus)]
    assert(response)
    contract.media(contract.responseMedia(response), example.response, example.id)
    const conditions = example.preconditions
    for (const condition of Object.values(conditions)) {
      assert.equal(typeof condition, 'boolean')
    }
    const expected = !conditions.artifactExists || !conditions.hasAnyAccess
      ? 404
      : conditions.actionAllowed ? 200 : 403
    assert.equal(example.expectedStatus, expected, `Visibility/permission classification: ${example.id}`)
  })
}

test('upload SAS samples carry only blob write permissions', () => {
  for (const example of examples.sasExamples) {
    assert.equal(example.schema, 'UploadSas')
    contract.component(example.schema, example.value, example.id)
    const url = new URL(example.value.url)
    assert.equal(url.searchParams.get('sp'), 'w')
    assert.equal(url.searchParams.get('sr'), 'b')
    assert.equal(url.searchParams.get('spr'), 'https')
    assert(!url.pathname.includes('/attempts/'), 'Blob key must be step-owned')
  }
})

test('repeated POST examples retain artifact identity and blob key', () => {
  const first = examples.requests.find(example => example.id === 'planner-registers-local-plan')
  assert(first && first.response && typeof first.response === 'object' && 'id' in first.response)
  for (const name of ['planner-requests-fresh-sas-after-upload', 'later-execution-reuses-step-artifact']) {
    const example = examples.requests.find(example => example.id === name)
    assert(example && example.response && typeof example.response === 'object' && 'id' in example.response)
    assert.equal(example.response.id, first.response.id, 'Repeat writes must retain artifact ID')
  }
  for (const example of examples.requests.filter(example => example.operationId === 'createArtifact')) {
    // These shapes were schema-validated above; check cross-example relationships.
    const body = example.body as { name: string }
    const response = example.response as { id: string, upload: { url: string, headers: Record<string, string> } }
    const caller = fixtures.contexts[example.context]
    const reference = caller.outputs.find(output => output.name === body.name)
    assert(reference, 'Registration must use a trusted own-output binding')
    const seed = fixtures.artifactIdentities.find(artifact => artifact.id === response.id)
    assert.deepEqual(seed?.reference, reference, 'Registration ID must match its step-owned artifact')
    const url = new URL(response.upload.url)
    const expectedPath = `/artifacts/v1/runs/${reference.runId}/steps/${reference.producerStepId}/artifacts/${reference.name}`
    assert.equal(url.pathname, expectedPath, 'Repeated POSTs must use the same step-owned key')
    assert.equal(url.searchParams.get('sp'), 'w')
  }
})

test('latest metadata example matches the last completion report', () => {
  const revised = examples.requests.find(example => example.id === 'planner-reports-revised-plan')
  const latest = examples.requests.find(example => example.id === 'coder-reads-latest-plan-metadata')
  assert(revised && latest)
  const completion = revised.body as { sizeBytes: number, sha256: string }
  const metadata = latest.response as { sizeBytes: number, sha256: string }
  assert.equal(metadata.sizeBytes, completion.sizeBytes, 'Latest metadata must reflect the last report')
  assert.equal(metadata.sha256, completion.sha256, 'Latest metadata must reflect the last report')
})

test('metadata example timestamps follow the acknowledgment lifecycle', () => {
  function checkTimestamps(value: unknown) {
    if (!value || typeof value !== 'object') {
      return
    }
    const record = value as Record<string, unknown>
    if ('createdAt' in record) {
      assert.equal(typeof record.updatedAt, 'string', 'Metadata needs updatedAt')
      assert(Date.parse(String(record.updatedAt)) >= Date.parse(String(record.createdAt)), 'updatedAt precedes creation')
      if (record.state === 'reserved') {
        assert.equal(record.updatedAt, record.createdAt, 'Registration starts both timestamps together')
      }
      if (record.state === 'uploaded') {
        assert.equal(record.updatedAt, record.uploadedAt, 'Completion updates both timestamps with one DB instant')
      }
    }
    for (const child of Object.values(record)) {
      checkTimestamps(child)
    }
  }
  for (const example of examples.requests) {
    checkTimestamps(example.response)
  }
  for (const operation of contract.operations.values()) {
    for (const response of Object.values(operation.responses)) {
      for (const example of Object.values(contract.responseMedia(response).examples)) {
        checkTimestamps(example.value)
      }
    }
  }
})

test('repeated POSTs can omit or change descriptive metadata without editing the original', () => {
  const first = examples.requests.find(example => example.id === 'planner-registers-local-plan')!
  const omitted = examples.requests.find(example => example.id === 'planner-requests-another-upload-sas')!
  const changed = examples.requests.find(example => example.id === 'planner-requests-fresh-sas-after-upload')!
  const latest = examples.requests.find(example => example.id === 'coder-reads-latest-plan-metadata')!
  assert(first && omitted && changed && latest)
  const original = first.body as Record<string, unknown>
  const repeat = omitted.body as Record<string, unknown>
  const different = changed.body as Record<string, unknown>
  const metadata = latest.response as Record<string, unknown>
  for (const field of ['kind', 'title', 'description']) {
    assert(!(field in repeat))
    assert.notEqual(different[field], original[field])
    assert.equal(metadata[field], original[field])
  }
})
