import { assert, expect, test } from 'vitest'
import { stepContextSchema } from './step-context.schema.ts'

const step = {
  runId: '10000000-0000-4000-8000-000000000001',
  stepId: '20000000-0000-4000-8000-000000000001',
  taskType: 'planner',
  inputs: [],
  outputs: [{ runId: '10000000-0000-4000-8000-000000000001', producerStepId: '20000000-0000-4000-8000-000000000001', name: 'plan' }],
}

test('context schema preserves valid values and rejects unknown nested fields', () => {
  const result = stepContextSchema.safeParse(step)
  expect(result.success).toBe(true)
  expect(result.data).toStrictEqual(step)
  const invalid = { ...step, outputs: [{ ...step.outputs[0], permissions: ['read-all'] }] }
  const parsed = stepContextSchema.safeParse(invalid)
  assert(!parsed.success)
  expect(parsed.error.issues.some(issue => issue.code === 'unrecognized_keys' && issue.path[0] === 'outputs')).toBe(true)
  expect('permissions' in invalid.outputs[0]!).toBe(true)
})

test('context shape requires bindings and rejects unknown top-level fields', () => {
  const { outputs: _outputs, ...incomplete } = step
  expect(stepContextSchema.safeParse(incomplete).success).toBe(false)
  expect(stepContextSchema.safeParse({ ...step, attemptId: step.stepId }).success).toBe(false)
})
