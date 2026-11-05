import { expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import { contexts, otherP1, planP1, planP2 } from '../../../tests/support/artifact-fixtures.ts'
import type { StepContext } from '../../../shared/types/artifact.ts'
import { requireArtifactPermission } from './require-artifact-access.ts'

// The guard module imports the Nitro database; permission checks never query it.
// Lookups by ID are covered against PostgreSQL in tests/integration/artifact-guards.test.ts.
vi.mock('../../db/use-db.ts', () => ({
  useDB: () => {
    throw new Error('No database in unit tests')
  },
}))

const eventFor = (step: StepContext) => ({ context: { step } }) as unknown as H3Event

test('registration needs create and update on the caller\'s own slot', () => {
  expect(() => requireArtifactPermission(eventFor(contexts['planner-p1']), planP1, ['create', 'update'])).not.toThrow()
  expect(() => requireArtifactPermission(eventFor(contexts['planner-p1-later-execution']), planP1, ['create', 'update'])).not.toThrow()
})

test('invisible references are 404: other steps, names, and callers without bindings', () => {
  for (const [step, reference] of [
    [contexts['coder-c1'], { ...planP1, producerStepId: contexts['coder-c1'].stepId }],
    [contexts['planner-p1'], otherP1],
    [contexts['planner-p2'], planP1],
    [contexts['unknown-task'], planP1],
  ] as const) {
    expect(() => requireArtifactPermission(eventFor(step), reference, ['create', 'update']))
      .toThrow(expect.objectContaining({ statusCode: 404, message: 'Artifact not found' }))
  }
})

test('a visible reference without every requested action is 403', () => {
  // Coder can read P1's plan but not write it; planner can write but not read.
  expect(() => requireArtifactPermission(eventFor(contexts['coder-c1']), planP1, ['create', 'update']))
    .toThrow(expect.objectContaining({ statusCode: 403, message: 'Forbidden' }))
  expect(() => requireArtifactPermission(eventFor(contexts['planner-p1']), planP1, ['read']))
    .toThrow(expect.objectContaining({ statusCode: 403 }))
  expect(() => requireArtifactPermission(eventFor(contexts['coder-multiple-inputs']), planP2, ['read'])).not.toThrow()
})
