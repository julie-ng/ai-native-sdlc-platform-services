import { assert, expect, test } from 'vitest'
import { callerContextSchema } from './caller-context.schema.ts'

const caller = {
  runId: '10000000-0000-4000-8000-000000000001',
  stepId: '20000000-0000-4000-8000-000000000001',
  taskType: 'planner',
  inputs: [],
  outputs: [{ runId: '10000000-0000-4000-8000-000000000001', producerStepId: '20000000-0000-4000-8000-000000000001', name: 'plan' }],
}

test('context schema preserves valid values and rejects unknown nested fields', () => {
  const result = callerContextSchema.safeParse(caller)
  expect(result.success).toBe(true)
  expect(result.data).toStrictEqual(caller)
  const invalid = { ...caller, outputs: [{ ...caller.outputs[0], permissions: ['read-all'] }] }
  const parsed = callerContextSchema.safeParse(invalid)
  assert(!parsed.success)
  expect(parsed.error.issues.some(issue => issue.code === 'unrecognized_keys' && issue.path[0] === 'outputs')).toBe(true)
  expect('permissions' in invalid.outputs[0]!).toBe(true)
})

test('context shape requires bindings and limits each binding array', () => {
  const { outputs: _outputs, ...incomplete } = caller
  expect(callerContextSchema.safeParse(incomplete).success).toBe(false)
  for (const field of ['inputs', 'outputs']) {
    expect(callerContextSchema.safeParse({ ...caller, [field]: Array.from({ length: 65 }, () => caller.outputs[0]) }).success).toBe(false)
  }
  expect(callerContextSchema.safeParse({ ...caller, attemptId: caller.stepId }).success).toBe(false)
})
