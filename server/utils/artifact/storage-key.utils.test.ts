import { expect, test } from 'vitest'
import { contexts, otherP1, planP1, planP2, planRunB } from '../../../tests/support/artifact-fixtures.ts'
import { artifactStorageKey } from './storage-key.utils.ts'

test('one stable key per step/name, shared by retries and later executions', () => {
  const key = artifactStorageKey(planP1)
  expect(key).toBe(`v1/runs/${planP1.runId}/steps/${planP1.producerStepId}/artifacts/plan`)
  expect(artifactStorageKey(contexts['planner-p1-later-execution'].outputs[0])).toBe(key)
  for (const other of [planP2, planRunB, otherP1]) {
    expect(artifactStorageKey(other)).not.toBe(key)
  }
})

test('reject invalid segments and physical key overrides rather than normalizing', () => {
  for (const value of [
    null, 'v1/runs/anything',
    ...['../plan', 'a/b', 'a.b', 'plan/', '%2f', 'plän', '', 'a--b', 'a'.repeat(65)].map(name => ({ ...planP1, name })),
    { ...planP1, runId: planP1.runId.toUpperCase().replace('1000', 'A000') },
    { ...planP1, producerStepId: '../step' },
    { ...planP1, blobKey: 'override' },
    { ...planP1, path: 'override' },
    { ...planP1, attemptId: '30000000-0000-4000-8000-000000000001' },
  ]) {
    expect(() => artifactStorageKey(value)).toThrow(new TypeError('Invalid artifact reference'))
  }
})
