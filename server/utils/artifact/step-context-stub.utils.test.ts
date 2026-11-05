import { expect, test } from 'vitest'
import { stubStepContext } from './step-context-stub.utils.ts'
import { readStepContext } from './context.utils.ts'
import { canAccessArtifact } from './policy.utils.ts'

test('planner is the default and both stub contexts are valid', () => {
  expect(stubStepContext(undefined)).toStrictEqual(stubStepContext('planner'))
  for (const taskType of ['planner', 'coder']) {
    const step = stubStepContext(taskType)
    expect(readStepContext({ step }).ok).toBe(true)
  }
})

test('the coder reads exactly the plan the planner writes', () => {
  const planner = stubStepContext('planner')!
  const coder = stubStepContext('coder')!
  const [plan] = planner.outputs
  expect(coder.inputs).toStrictEqual([plan])
  expect(canAccessArtifact(planner, plan!, 'update')).toBe(true)
  expect(canAccessArtifact(planner, plan!, 'read')).toBe(false)
  expect(canAccessArtifact(coder, plan!, 'read')).toBe(true)
  expect(canAccessArtifact(coder, plan!, 'update')).toBe(false)
})

test('other task types get no context', () => {
  for (const taskType of ['', 'admin', 'Planner']) {
    expect(stubStepContext(taskType)).toBeUndefined()
  }
})

test('each call returns an independent copy', () => {
  stubStepContext('coder')!.inputs.length = 0
  expect(stubStepContext('coder')!.inputs).toHaveLength(1)
})
