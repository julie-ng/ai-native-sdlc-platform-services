import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artifactRecords, contexts, examples } from '../../../tests/support/artifact-fixtures.ts'
import { createMetadataFake, createUrlIssuerSpy, createWorkflowIdentityFake } from '../../../tests/support/artifact-fakes.ts'
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

// A boundary probe exercises scoped lookup + pure action decisions with ports.
// This is not an HTTP/service implementation or proof of runtime route wiring.
for (const example of examples.accessCases) {
  test(`scoped port/policy composition: ${example.id}`, async () => {
    const caller = contexts[example.context]!
    const metadata = createMetadataFake(artifactRecords())
    const urls = createUrlIssuerSpy()
    const access = deriveArtifactAccess(caller)
    const visible = visibleArtifactReferences(access)
    if (example.operationId === 'createArtifact') {
      assert(example.body?.name)
      const reference = { runId: caller.runId, producerStepId: caller.stepId, name: example.body.name }
      assert(!visible.some(ref => sameArtifactReference(ref, reference)))
      assert.equal(example.expectedStatus, 404)
      assert.equal(metadata.findReferenceWithinScope.mock.callCount(), 0)
      assert.equal(urls.issueUpload.mock.callCount(), 0)
      return
    }
    assert(example.parameters)
    const record = await metadata.findWithinScope(example.parameters.id, visible)
    let status = 404
    if (record.ok) {
      const action = example.operationId === 'completeArtifact' ? 'update' : 'read'
      status = canAccessArtifact(caller, record.value.reference, action) ? 200 : 403
      if (status === 200 && record.value.state === 'uploaded') {
        await urls.issueDownload(record.value)
      }
    }
    assert.equal(status, example.expectedStatus)
    assert.equal(urls.issueDownload.mock.callCount(), 0)
    assert.equal(urls.issueUpload.mock.callCount(), 0)
  })
}

test('discovery scope includes only readable bindings, de-duplicates and omits unregistered inputs', async () => {
  const metadata = createMetadataFake(artifactRecords())
  for (const [name, count] of [['planner-p1', 0], ['coder-c1', 1], ['coder-multiple-inputs', 2], ['coder-no-inputs', 0], ['unknown-task', 0]] as const) {
    const result = await metadata.listWithinScope(deriveArtifactAccess(contexts[name]!).readable)
    assert(result.ok)
    assert.equal(result.value.length, count)
  }
  const caller = structuredClone(contexts['coder-c1']!)
  caller.inputs.push({ ...caller.inputs[0]! }, { ...caller.inputs[0]!, producerStepId: '20000000-0000-4000-8000-000000000099' })
  const result = await metadata.listWithinScope(deriveArtifactAccess(caller).readable)
  assert(result.ok)
  assert.equal(result.value.length, 1)
  const urls = createUrlIssuerSpy()
  assert.equal(urls.issueDownload.mock.callCount(), 0)
})

test('test ports retain discriminated failures and never fake completed uploads', async () => {
  const metadata = createMetadataFake([])
  const ref = contexts['planner-p1']!.outputs[0]!
  assert.deepEqual(await metadata.register(ref, { contentType: 'text/markdown' }), { ok: false, error: 'unavailable' })
  assert.deepEqual(await metadata.findReferenceWithinScope(ref, [ref]), { ok: false, error: 'not_found' })
  const identities = createWorkflowIdentityFake([{ runId: ref.runId, stepId: ref.producerStepId }])
  assert.deepEqual(await identities.findStep(ref.producerStepId), { ok: true, value: { runId: ref.runId, stepId: ref.producerStepId } })
  assert.deepEqual(await identities.findStep('missing'), { ok: false, error: 'not_found' })
  const urls = createUrlIssuerSpy()
  assert.deepEqual(await urls.issueUpload(artifactRecords()[0]!, 'create-or-update'), { ok: false, error: 'unavailable' })
})
