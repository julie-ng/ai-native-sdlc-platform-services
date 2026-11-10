import { expect, test } from 'vitest'
import { createHmac } from 'node:crypto'
import { equalAdminToken, isStepTokenExpired, signStepToken, stepTokenExpiresAt, taskActions, verifyStepToken } from './step-token.utils.ts'
import { contexts, runA, runB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import { canAccessArtifact } from '../artifact/policy.utils.ts'

const key = 'test-signing-key'
const scope = { runId: runA, createdAt: new Date('2026-11-10T10:00:00.000Z'), stepId: stepIds.plannerP1, taskType: 'planner' as const }

test('signs the canonical tuple with sorted actions and verifies it', () => {
  const expected = createHmac('sha256', key).update(JSON.stringify([
    runA, scope.createdAt.toISOString(), `step:${scope.stepId}`, ['create', 'update'],
  ])).digest('hex')
  expect(signStepToken(key, scope)).toBe(expected)
  expect(verifyStepToken(expected, key, scope)).toBe(true)
})

test('binds key, run, timestamp, step and granted actions', () => {
  const token = signStepToken(key, scope)
  expect(verifyStepToken(token, 'other-key', scope)).toBe(false)
  for (const changed of [
    { ...scope, runId: runB },
    { ...scope, createdAt: new Date(scope.createdAt.getTime() + 1) },
    { ...scope, stepId: stepIds.coderC1 },
    { ...scope, taskType: 'coder' as const },
  ]) {
    expect(verifyStepToken(token, key, changed)).toBe(false)
  }
})

test('malformed signatures fail without buffer length errors', () => {
  for (const token of ['', 'a', 'g'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) {
    expect(verifyStepToken(token, key, scope)).toBe(false)
  }
})

test('expiry is shared with issuance and includes the exact deadline', () => {
  const expiresAt = stepTokenExpiresAt(scope.createdAt, 15)
  expect(expiresAt.toISOString()).toBe('2026-11-10T10:15:00.000Z')
  expect(isStepTokenExpired(scope.createdAt, 15, new Date(expiresAt.getTime() - 1))).toBe(false)
  expect(isStepTokenExpired(scope.createdAt, 15, expiresAt)).toBe(true)
  expect(isStepTokenExpired(scope.createdAt, 15, new Date(expiresAt.getTime() + 1))).toBe(true)
  expect(scope.createdAt.toISOString()).toBe('2026-11-10T10:00:00.000Z')
})

test('opaque admin comparison handles different lengths and equal byte lengths', () => {
  expect(equalAdminToken('admin-secret', 'admin-secret')).toBe(true)
  expect(equalAdminToken('bad', 'admin-secret')).toBe(false)
  expect(equalAdminToken('admin-secreu', 'admin-secret')).toBe(false)
})

test('signed task actions agree with implemented artifact permissions', () => {
  for (const step of [contexts['planner-p1'], contexts['coder-c1']]) {
    const reference = [...step.inputs, ...step.outputs][0]!
    const granted = (['create', 'read', 'update'] as const).filter(action => canAccessArtifact(step, reference, action))
    expect(granted).toEqual(taskActions[step.taskType as keyof typeof taskActions])
  }
})
