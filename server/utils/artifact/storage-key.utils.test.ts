import { expect, test } from 'vitest'
import { contexts, examples, fixture } from '../../../tests/support/artifact-fixtures.ts'
import { artifactStorageKey } from './storage-key.utils.ts'

test('exact merged storage key, stable across repeated POSTs, overwrite and same-step later execution', () => {
  const reference = contexts['planner-p1']!.outputs[0]!
  const key = artifactStorageKey(reference)
  expect(key).toBe(`v1/runs/${reference.runId}/steps/${reference.producerStepId}/artifacts/plan`)
  expect(artifactStorageKey(contexts['planner-p1-later-execution']!.outputs[0])).toBe(key)
  for (const example of examples.requests) {
    if ('upload' in example.response && example.response.upload) {
      expect(new URL(example.response.upload.url).pathname).toBe(`/artifacts/${key}`)
    }
  }
  for (const { reference: other } of fixture.artifactRecords.slice(1)) {
    expect(artifactStorageKey(other)).not.toBe(key)
  }
})

test('reject invalid segments and physical key overrides rather than normalizing', () => {
  const reference = contexts['planner-p1']!.outputs[0]!
  for (const value of [
    null, 'v1/runs/anything',
    ...['../plan', 'a/b', 'a.b', 'plan/', '%2f', 'plän', '', 'a--b', 'a'.repeat(65)].map(name => ({ ...reference, name })),
    { ...reference, runId: reference.runId.toUpperCase().replace('1000', 'A000') },
    { ...reference, producerStepId: '../step' },
    { ...reference, blobKey: 'override' },
    { ...reference, path: 'override' },
    { ...reference, attemptId: '30000000-0000-4000-8000-000000000001' },
  ]) {
    expect(() => artifactStorageKey(value)).toThrow(new TypeError('Invalid artifact reference'))
  }
})
