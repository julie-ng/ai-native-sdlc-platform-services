import { assert, beforeAll, expect, test } from 'vitest'
import { examples, fixtures, loadArtifactContract } from './support/artifact-contract.utils.ts'

let contract: Awaited<ReturnType<typeof loadArtifactContract>>
beforeAll(async () => {
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
      expect(typeof condition).toBe('boolean')
    }
    const expected = !conditions.artifactExists || !conditions.hasAnyAccess
      ? 404
      : conditions.actionAllowed ? 200 : 403
    expect(example.expectedStatus, `Visibility/permission classification: ${example.id}`).toBe(expected)
  })
}

test('upload SAS samples carry only blob write permissions', () => {
  for (const example of examples.sasExamples) {
    expect(example.schema).toBe('UploadSas')
    contract.component(example.schema, example.value, example.id)
    const url = new URL(example.value.url)
    expect(url.searchParams.get('sp')).toBe('w')
    expect(url.searchParams.get('sr')).toBe('b')
    expect(url.searchParams.get('spr')).toBe('https')
    expect(url.pathname.includes('/attempts/'), 'Blob key must be step-owned').toBe(false)
  }
})

test('repeated POST examples retain artifact ID and blob key', () => {
  const first = examples.requests.find(example => example.id === 'planner-registers-local-plan')
  assert(first && first.response && typeof first.response === 'object' && 'id' in first.response)
  for (const name of ['planner-requests-fresh-sas-after-upload', 'later-execution-reuses-step-artifact']) {
    const example = examples.requests.find(example => example.id === name)
    assert(example && example.response && typeof example.response === 'object' && 'id' in example.response)
    expect(example.response.id, 'Repeat writes must retain artifact ID').toBe(first.response.id)
  }
  for (const example of examples.requests.filter(example => example.operationId === 'createArtifact')) {
    // The examples suite validates shapes; this suite checks authored relationships.
    const body = example.body as { name: string }
    const response = example.response as { id: string, upload: { url: string, headers: Record<string, string> } }
    const caller = fixtures.contexts[example.context]
    const reference = caller.outputs.find(output => output.name === body.name)
    assert(reference, 'Registration must use a trusted own-output binding')
    const seed = fixtures.artifactRecords.find(artifact => artifact.id === response.id)
    expect(seed?.reference, 'Registration ID must match its step-owned artifact').toStrictEqual(reference)
    const url = new URL(response.upload.url)
    const expectedPath = `/artifacts/v1/runs/${reference.runId}/steps/${reference.producerStepId}/artifacts/${reference.name}`
    expect(url.pathname, 'Repeated POSTs must use the same step-owned key').toBe(expectedPath)
    expect(url.searchParams.get('sp')).toBe('w')
  }
})

test('latest metadata example matches the last completion report', () => {
  const revised = examples.requests.find(example => example.id === 'planner-reports-revised-plan')
  const latest = examples.requests.find(example => example.id === 'coder-reads-latest-plan-metadata')
  assert(revised && latest)
  const completion = revised.body as { sizeBytes: number, sha256: string }
  const metadata = latest.response as { sizeBytes: number, sha256: string }
  expect(metadata.sizeBytes, 'Latest metadata must reflect the last report').toBe(completion.sizeBytes)
  expect(metadata.sha256, 'Latest metadata must reflect the last report').toBe(completion.sha256)
})

test('metadata example timestamps follow the acknowledgment lifecycle', () => {
  function checkTimestamps(value: unknown) {
    if (!value || typeof value !== 'object') {
      return
    }
    const record = value as Record<string, unknown>
    if ('createdAt' in record) {
      expect(typeof record.updatedAt, 'Metadata needs updatedAt').toBe('string')
      expect(Date.parse(String(record.updatedAt)) >= Date.parse(String(record.createdAt)), 'updatedAt precedes creation').toBeTruthy()
      if (record.state === 'reserved') {
        expect(record.updatedAt, 'Registration starts both timestamps together').toBe(record.createdAt)
      }
      if (record.state === 'uploaded') {
        expect(record.updatedAt, 'Completion updates both timestamps with one DB instant').toBe(record.uploadedAt)
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
  expect(first && omitted && changed && latest).toBeTruthy()
  const original = first.body as Record<string, unknown>
  const repeat = omitted.body as Record<string, unknown>
  const different = changed.body as Record<string, unknown>
  const metadata = latest.response as Record<string, unknown>
  for (const field of ['kind', 'title', 'description']) {
    expect(field in repeat).toBe(false)
    expect(different[field]).not.toBe(original[field])
    expect(metadata[field]).toBe(original[field])
  }
})
