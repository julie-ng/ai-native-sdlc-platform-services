import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { examples, fixtures, loadArtifactContract } from './support/artifact-contract.utils.ts'
import type { ArtifactRef } from '../../shared/types/artifact.ts'

let contract: Awaited<ReturnType<typeof loadArtifactContract>>
before(async () => {
  contract = await loadArtifactContract()
})

test('authored fixture records and bindings are internally consistent', () => {
  const { component } = contract
  assert.equal(fixtures.testOnly, true)
  const runs = new Set(fixtures.workflowRecords.runs.map(run => run.id))
  const steps = new Map(fixtures.workflowRecords.steps.map(step => [step.id, step]))
  assert.equal(runs.size, fixtures.workflowRecords.runs.length, 'Duplicate run ID')
  assert.equal(steps.size, fixtures.workflowRecords.steps.length, 'Duplicate step ID')
  for (const run of fixtures.workflowRecords.runs) {
    component('Uuid', run.id, 'workflow run ID')
  }
  for (const step of steps.values()) {
    component('Uuid', step.id, 'workflow step ID')
    assert(runs.has(step.runId), 'Unknown run in seed data')
  }
  function checkReference(reference: ArtifactRef) {
    component('ArtifactRef', reference, 'trusted reference')
    assert.equal(steps.get(reference.producerStepId)?.runId, reference.runId)
  }
  for (const [name, context] of Object.entries(fixtures.contexts)) {
    component('CallerContext', context, name)
    assert.equal(steps.get(context.stepId)?.runId, context.runId)
    for (const reference of [...context.inputs, ...context.outputs]) {
      checkReference(reference)
      assert.equal(reference.runId, context.runId)
    }
    for (const reference of context.outputs) {
      assert.equal(reference.producerStepId, context.stepId)
    }
  }
  const artifactIds = new Set<string>()
  const artifactKeys = new Set<string>()
  for (const artifact of fixtures.artifactRecords) {
    const key = `${artifact.reference.producerStepId}:${artifact.reference.name}`
    assert(!artifactIds.has(artifact.id), 'Duplicate artifact ID')
    assert(!artifactKeys.has(key), 'More than one artifact for the same step/name')
    artifactIds.add(artifact.id)
    artifactKeys.add(key)
    component('Uuid', artifact.id, 'seed artifact ID')
    checkReference(artifact.reference)
  }
})

for (const example of examples.invalidContexts) {
  test(`both schema validators reject context: ${example.id}`, () => {
    contract.component('CallerContext', example.value, example.id, false)
  })
}
test('policy example references, actions and expectations are valid test data', () => {
  for (const example of examples.policyCases) {
    assert(fixtures.contexts[example.context], example.id)
    assert(['create', 'read', 'update'].includes(example.action))
    assert.equal(typeof example.expected, 'boolean')
    contract.component('ArtifactRef', example.reference, example.id)
  }
})
