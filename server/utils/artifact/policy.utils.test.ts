import { expect, test } from 'vitest'
import { contexts, examples } from '../../../tests/support/artifact-fixtures.ts'
import { canAccessArtifact, deriveArtifactAccess, visibleArtifactReferences, sameArtifactReference } from './policy.utils.ts'
import type { ArtifactAction, CallerContext } from './ports.ts'

for (const example of examples.policyCases) {
  test(`policy contract: ${example.id}`, () => {
    expect(canAccessArtifact(contexts[example.context]!, example.reference, example.action as ArtifactAction)).toBe(example.expected)
  })
}

test('planner creates/updates own bound plan; coder reads exact declared plan', () => {
  const planner = contexts['planner-p1']!
  const coder = contexts['coder-c1']!
  const ref = planner.outputs[0]!
  expect(canAccessArtifact(planner, ref, 'create')).toBe(true)
  expect(canAccessArtifact(planner, ref, 'update')).toBe(true)
  expect(canAccessArtifact(planner, ref, 'read')).toBe(false)
  expect(canAccessArtifact(coder, ref, 'read')).toBe(true)
  for (const action of ['create', 'update', 'delete', '__proto__', 'constructor']) {
    expect(canAccessArtifact(coder, ref, action as ArtifactAction)).toBe(false)
  }
  for (const reference of [
    { ...ref, name: 'other' },
    { ...ref, runId: '10000000-0000-4000-8000-000000000002' },
    { ...ref, producerStepId: contexts['planner-p2']!.stepId },
  ]) {
    for (const action of ['create', 'read', 'update'] as const) {
      expect(canAccessArtifact(planner, reference, action)).toBe(false)
      expect(canAccessArtifact(coder, reference, action)).toBe(false)
    }
  }
  expect(canAccessArtifact({ ...coder, inputs: [] }, ref, 'read')).toBe(false)
  expect(canAccessArtifact({ ...planner, outputs: [] }, ref, 'create')).toBe(false)
  expect(canAccessArtifact(contexts['planner-p2']!, ref, 'update')).toBe(false)
  for (const taskType of ['unknown', 'constructor', '__proto__']) {
    expect(deriveArtifactAccess({ ...coder, taskType })).toStrictEqual({ readable: [], creatable: [], updatable: [] })
  }
})

test('policy fails closed on invalid JS callers and does not mutate or retain bindings', () => {
  const caller = structuredClone(contexts['planner-p1']!)
  const before = structuredClone(caller)
  caller.outputs.push({ ...caller.outputs[0]! })
  const access = deriveArtifactAccess(caller)
  expect(access.creatable.length).toBe(1)
  expect(access.updatable.length).toBe(1)
  expect(visibleArtifactReferences(access).length).toBe(1)
  access.creatable[0]!.name = 'changed'
  expect(caller.outputs[0]).toStrictEqual(before.outputs[0])
  expect(access.updatable[0]!.name).toBe('plan')
  expect(deriveArtifactAccess(null as unknown as CallerContext)).toStrictEqual({ readable: [], creatable: [], updatable: [] })
})

test('read scope follows declared bindings and de-duplicates without assuming persistence', () => {
  for (const [name, count] of [['planner-p1', 0], ['coder-c1', 1], ['coder-multiple-inputs', 2], ['coder-no-inputs', 0], ['unknown-task', 0]] as const) {
    expect(deriveArtifactAccess(contexts[name]!).readable.length).toBe(count)
  }
  const caller = structuredClone(contexts['coder-c1']!)
  const unregistered = { ...caller.inputs[0]!, producerStepId: '20000000-0000-4000-8000-000000000099' }
  caller.inputs.push({ ...caller.inputs[0]! }, unregistered)
  // Policy returns permitted references; a real repository will resolve which exist.
  expect(deriveArtifactAccess(caller).readable).toStrictEqual([caller.inputs[0], unregistered])
})

test('visibility is the de-duplicated union of effective read/create/update scopes', () => {
  const first = contexts['planner-p1']!.outputs[0]!
  const second = contexts['planner-p2']!.outputs[0]!
  expect(sameArtifactReference(first, second)).toBe(false)
  expect(visibleArtifactReferences({ readable: [first], creatable: [second], updatable: [{ ...first }, { ...second }] })).toStrictEqual([first, second])
  expect(visibleArtifactReferences({ readable: [], creatable: [], updatable: [] })).toStrictEqual([])
})
