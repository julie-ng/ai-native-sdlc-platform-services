import { expect, test } from 'vitest'
import { contexts, otherP1, planP1, planP2, planRunB } from '../../../tests/support/artifact-fixtures.ts'
import { deriveBlobName } from './blob.utils.ts'

test('one stable blob name per step/name, shared by retries and later executions', () => {
  const blobName = deriveBlobName(planP1)
  expect(blobName).toBe(`v1/runs/${planP1.runId}/steps/${planP1.producerStepId}/artifacts/plan`)
  expect(deriveBlobName(contexts['planner-p1-later-execution'].outputs[0])).toBe(blobName)
  for (const other of [planP2, planRunB, otherP1]) {
    expect(deriveBlobName(other)).not.toBe(blobName)
  }
})

test('reject invalid segments and physical blob name overrides rather than normalizing', () => {
  for (const value of [
    null, 'v1/runs/anything',
    ...['../plan', 'a/b', 'a.b', 'plan/', '%2f', 'plän', '', 'a--b', 'a'.repeat(65)].map(name => ({ ...planP1, name })),
    { ...planP1, runId: planP1.runId.toUpperCase().replace('1000', 'A000') },
    { ...planP1, producerStepId: '../step' },
    { ...planP1, blobKey: 'override' },
    { ...planP1, path: 'override' },
    { ...planP1, attemptId: '30000000-0000-4000-8000-000000000001' },
  ]) {
    expect(() => deriveBlobName(value)).toThrow(new TypeError('Invalid artifact reference'))
  }
})
