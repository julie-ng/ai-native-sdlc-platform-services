import { expect, test } from 'vitest'
import { contexts, otherP1, planP1, planP2, planRunB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import { canAccessArtifact, deriveArtifactAccess, isArtifactVisible, visibleArtifactReferences, sameArtifactReference } from './policy.utils.ts'
import type { ArtifactAction, CallerContext } from './ports.ts'

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
    expect(deriveArtifactAccess({ ...contexts['coder-c1'], taskType })).toStrictEqual({ readable: [], creatable: [], updatable: [] })
  }
})

test('visibility is any granted action; it separates 404 from 403', () => {
  // Planner can write but not read its plan: visible, so a read is 403 rather than 404.
  expect(isArtifactVisible(contexts['planner-p1'], planP1)).toBe(true)
  expect(isArtifactVisible(contexts['coder-c1'], planP1)).toBe(true)
  for (const [caller, reference] of [
    [contexts['planner-p2'], planP1],
    [contexts['coder-c1'], planP2],
    [contexts['planner-p1'], otherP1],
    [contexts['unknown-task'], planP1],
  ] as const) {
    expect(isArtifactVisible(caller, reference)).toBe(false)
  }
})

test('policy fails closed on invalid JS callers and does not mutate or retain bindings', () => {
  const caller = structuredClone(contexts['planner-p1']) as CallerContext
  const before = structuredClone(caller)
  caller.outputs.push({ ...caller.outputs[0]! })
  const access = deriveArtifactAccess(caller)
  expect(access.creatable.length).toBe(1)
  expect(access.updatable.length).toBe(1)
  expect(visibleArtifactReferences(access).length).toBe(1)
  ;(access.creatable[0] as { name: string }).name = 'changed'
  expect(caller.outputs[0]).toStrictEqual(before.outputs[0])
  expect(access.updatable[0]!.name).toBe('plan')
  expect(deriveArtifactAccess(null as unknown as CallerContext)).toStrictEqual({ readable: [], creatable: [], updatable: [] })
})

test('read scope follows declared bindings and de-duplicates without assuming persistence', () => {
  for (const [name, count] of [['planner-p1', 0], ['coder-c1', 1], ['coder-multiple-inputs', 2], ['coder-no-inputs', 0], ['unknown-task', 0]] as const) {
    expect(deriveArtifactAccess(contexts[name]).readable.length).toBe(count)
  }
  const caller = structuredClone(contexts['coder-c1']) as CallerContext
  const unregistered = { ...planP1, producerStepId: '20000000-0000-4000-8000-000000000099' }
  caller.inputs.push({ ...planP1 }, unregistered)
  // Policy returns permitted references; the repository resolves which exist.
  expect(deriveArtifactAccess(caller).readable).toStrictEqual([planP1, unregistered])
  expect(sameArtifactReference(planP1, { ...planP1, producerStepId: stepIds.plannerP2 })).toBe(false)
})
