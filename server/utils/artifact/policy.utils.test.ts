import { expect, test } from 'vitest'
import { contexts, otherP1, planP1, planP2, planRunB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import type { StepContext } from '../../../shared/types/artifact.ts'
import { canAccessArtifact, isArtifactVisible, readableArtifactReferences, sameArtifactReference } from './policy.utils.ts'
import type { ArtifactAction } from './policy.utils.ts'

test('planner creates/updates its own bound plan; coder reads its exact bound plan', () => {
  const planner = contexts['planner-p1']
  const coder = contexts['coder-c1']
  expect(canAccessArtifact(planner, planP1, 'create')).toBe(true)
  expect(canAccessArtifact(planner, planP1, 'update')).toBe(true)
  expect(canAccessArtifact(planner, planP1, 'read')).toBe(false)
  expect(canAccessArtifact(contexts['planner-p1-later-execution'], planP1, 'update')).toBe(true)
  expect(canAccessArtifact(coder, planP1, 'read')).toBe(true)
  for (const action of ['create', 'update', 'delete', '__proto__', 'constructor']) {
    expect(canAccessArtifact(coder, planP1, action as ArtifactAction)).toBe(false)
  }
  for (const action of ['delete', '__proto__', 'constructor']) {
    expect(canAccessArtifact(planner, planP1, action as ArtifactAction)).toBe(false)
  }
})

test('a reference is not a permission: other names, runs and steps grant nothing', () => {
  for (const reference of [otherP1, planRunB, planP2]) {
    for (const action of ['create', 'read', 'update'] as const) {
      expect(canAccessArtifact(contexts['planner-p1'], reference, action)).toBe(false)
      expect(canAccessArtifact(contexts['coder-c1'], reference, action)).toBe(false)
    }
  }
  expect(canAccessArtifact(contexts['planner-p2'], planP1, 'update')).toBe(false)
  expect(canAccessArtifact({ ...contexts['coder-c1'], inputs: [] }, planP1, 'read')).toBe(false)
  expect(canAccessArtifact({ ...contexts['planner-p1'], outputs: [] }, planP1, 'create')).toBe(false)
  for (const taskType of ['unknown', 'constructor', '__proto__']) {
    const step = { ...contexts['coder-c1'], taskType }
    expect(isArtifactVisible(step, planP1)).toBe(false)
    expect(readableArtifactReferences(step)).toStrictEqual([])
  }
})

test('visibility is any granted action; it separates 404 from 403', () => {
  // Planner can write but not read its plan: visible, so a read is 403 rather than 404.
  expect(isArtifactVisible(contexts['planner-p1'], planP1)).toBe(true)
  expect(isArtifactVisible(contexts['coder-c1'], planP1)).toBe(true)
  for (const [step, reference] of [
    [contexts['planner-p2'], planP1],
    [contexts['coder-c1'], planP2],
    [contexts['planner-p1'], otherP1],
    [contexts['unknown-task'], planP1],
  ] as const) {
    expect(isArtifactVisible(step, reference)).toBe(false)
  }
})

test('policy fails closed on invalid JS callers and does not mutate bindings', () => {
  const step = structuredClone(contexts['planner-p1']) as StepContext
  const before = structuredClone(step)
  expect(canAccessArtifact(step, planP1, 'create')).toBe(true)
  expect(readableArtifactReferences(step)).toStrictEqual([])
  expect(step).toStrictEqual(before)
  for (const invalid of [null, undefined, {}, { ...contexts['coder-c1'], inputs: [planRunB] }]) {
    expect(canAccessArtifact(invalid as unknown as StepContext, planP1, 'read')).toBe(false)
    expect(readableArtifactReferences(invalid as unknown as StepContext)).toStrictEqual([])
  }
})

test('read scope follows declared bindings without assuming persistence', () => {
  for (const [name, count] of [['planner-p1', 0], ['coder-c1', 1], ['coder-multiple-inputs', 2], ['coder-no-inputs', 0], ['unknown-task', 0]] as const) {
    expect(readableArtifactReferences(contexts[name]).length).toBe(count)
  }
  const step = structuredClone(contexts['coder-c1']) as StepContext
  const unregistered = { ...planP1, producerStepId: '20000000-0000-4000-8000-000000000099' }
  step.inputs.push({ ...otherP1 }, unregistered)
  // Policy returns permitted references; the repository resolves which exist.
  expect(readableArtifactReferences(step)).toStrictEqual([planP1, unregistered])
  expect(sameArtifactReference(planP1, { ...planP1, producerStepId: stepIds.plannerP2 })).toBe(false)
})
