import { beforeAll, expect, test } from 'vitest'
import { examples, fixtures, loadArtifactContract } from './support/artifact-contract.utils.ts'
import type { ArtifactRef } from '../../shared/types/artifact.ts'

let contract: Awaited<ReturnType<typeof loadArtifactContract>>
beforeAll(async () => {
  contract = await loadArtifactContract()
})

test('authored fixture records and bindings are internally consistent', () => {
  const { component } = contract
  expect(fixtures.testOnly).toBe(true)
  const runs = new Set(fixtures.workflowRecords.runs.map(run => run.id))
  const steps = new Map(fixtures.workflowRecords.steps.map(step => [step.id, step]))
  expect(runs.size, 'Duplicate run ID').toBe(fixtures.workflowRecords.runs.length)
  expect(steps.size, 'Duplicate step ID').toBe(fixtures.workflowRecords.steps.length)
  for (const run of fixtures.workflowRecords.runs) {
    component('Uuid', run.id, 'workflow run ID')
  }
  for (const step of steps.values()) {
    component('Uuid', step.id, 'workflow step ID')
    expect(runs.has(step.runId), 'Unknown run in seed data').toBe(true)
  }
  function checkReference(reference: ArtifactRef) {
    component('ArtifactRef', reference, 'trusted reference')
    expect(steps.get(reference.producerStepId)?.runId).toBe(reference.runId)
  }
  for (const [name, context] of Object.entries(fixtures.contexts)) {
    component('CallerContext', context, name)
    expect(steps.get(context.stepId)?.runId).toBe(context.runId)
    for (const reference of [...context.inputs, ...context.outputs]) {
      checkReference(reference)
      expect(reference.runId).toBe(context.runId)
    }
    for (const reference of context.outputs) {
      expect(reference.producerStepId).toBe(context.stepId)
    }
  }
  const artifactIds = new Set<string>()
  const artifactKeys = new Set<string>()
  for (const artifact of fixtures.artifactRecords) {
    const key = `${artifact.reference.producerStepId}:${artifact.reference.name}`
    expect(artifactIds.has(artifact.id), 'Duplicate artifact ID').toBe(false)
    expect(artifactKeys.has(key), 'More than one artifact for the same step/name').toBe(false)
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
    expect(fixtures.contexts[example.context], example.id).toBeTruthy()
    expect(['create', 'read', 'update'].includes(example.action)).toBeTruthy()
    expect(typeof example.expected).toBe('boolean')
    contract.component('ArtifactRef', example.reference, example.id)
  }
})
