import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contexts, examples } from '../../../tests/support/artifact-fixtures.ts'
import { canAccessArtifact, deriveArtifactAccess, visibleArtifactReferences, sameArtifactReference } from './policy.utils.ts'
import type { ArtifactAction, CallerContext } from './ports.ts'

for (const example of examples.policyCases) {
  test(`policy contract: ${example.id}`, () => {
    assert.equal(canAccessArtifact(contexts[example.context]!, example.reference, example.action as ArtifactAction), example.expected)
  })
}

test('planner creates/updates own bound plan; coder reads exact declared plan', () => {
  const planner = contexts['planner-p1']!
  const coder = contexts['coder-c1']!
  const ref = planner.outputs[0]!
  assert(canAccessArtifact(planner, ref, 'create'))
  assert(canAccessArtifact(planner, ref, 'update'))
  assert(!canAccessArtifact(planner, ref, 'read'))
  assert(canAccessArtifact(coder, ref, 'read'))
  for (const action of ['create', 'update', 'delete', '__proto__', 'constructor']) {
    assert(!canAccessArtifact(coder, ref, action as ArtifactAction))
  }
  for (const reference of [
    { ...ref, name: 'other' },
    { ...ref, runId: '10000000-0000-4000-8000-000000000002' },
    { ...ref, producerStepId: contexts['planner-p2']!.stepId },
  ]) {
    for (const action of ['create', 'read', 'update'] as const) {
      assert(!canAccessArtifact(planner, reference, action))
      assert(!canAccessArtifact(coder, reference, action))
    }
  }
  assert(!canAccessArtifact({ ...coder, inputs: [] }, ref, 'read'))
  assert(!canAccessArtifact({ ...planner, outputs: [] }, ref, 'create'))
  assert(!canAccessArtifact(contexts['planner-p2']!, ref, 'update'))
  for (const taskType of ['unknown', 'constructor', '__proto__']) {
    assert.deepEqual(deriveArtifactAccess({ ...coder, taskType }), { readable: [], creatable: [], updatable: [] })
  }
})

test('policy fails closed on invalid JS callers and does not mutate or retain bindings', () => {
  const caller = structuredClone(contexts['planner-p1']!)
  const before = structuredClone(caller)
  caller.outputs.push({ ...caller.outputs[0]! })
  const access = deriveArtifactAccess(caller)
  assert.equal(access.creatable.length, 1)
  assert.equal(access.updatable.length, 1)
  assert.equal(visibleArtifactReferences(access).length, 1)
  access.creatable[0]!.name = 'changed'
  assert.deepEqual(caller.outputs[0], before.outputs[0])
  assert.equal(access.updatable[0]!.name, 'plan')
  assert.deepEqual(deriveArtifactAccess(null as unknown as CallerContext), { readable: [], creatable: [], updatable: [] })
})

test('read scope follows declared bindings and de-duplicates without assuming persistence', () => {
  for (const [name, count] of [['planner-p1', 0], ['coder-c1', 1], ['coder-multiple-inputs', 2], ['coder-no-inputs', 0], ['unknown-task', 0]] as const) {
    assert.equal(deriveArtifactAccess(contexts[name]!).readable.length, count)
  }
  const caller = structuredClone(contexts['coder-c1']!)
  const unregistered = { ...caller.inputs[0]!, producerStepId: '20000000-0000-4000-8000-000000000099' }
  caller.inputs.push({ ...caller.inputs[0]! }, unregistered)
  // Policy returns permitted references; a real repository will resolve which exist.
  assert.deepEqual(deriveArtifactAccess(caller).readable, [caller.inputs[0], unregistered])
})

test('visibility is the de-duplicated union of effective read/create/update scopes', () => {
  const first = contexts['planner-p1']!.outputs[0]!
  const second = contexts['planner-p2']!.outputs[0]!
  assert(!sameArtifactReference(first, second))
  assert.deepEqual(visibleArtifactReferences({ readable: [first], creatable: [second], updatable: [{ ...first }, { ...second }] }), [first, second])
  assert.deepEqual(visibleArtifactReferences({ readable: [], creatable: [], updatable: [] }), [])
})
