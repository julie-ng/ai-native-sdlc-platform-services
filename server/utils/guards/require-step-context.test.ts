import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireStepContext } from './require-step-context.ts'
import { signStepToken } from '../auth/step-token.utils.ts'
import { runA, runB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import { findRunSteps } from '../run/repository.utils.ts'

const config = vi.hoisted(() => ({ hmacKey: 'test-hmac-key', hmacTokenExpiryMinutes: 15 as number | string, databaseUrl: 'postgres://test' }))
const log = vi.hoisted(() => vi.fn())
vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }))
vi.mock('../log-security-event.utils.ts', () => ({ logSecurityEvent: log }))
vi.mock('../../db/use-db.ts', () => ({ useDB: () => ({}) }))
vi.mock('../run/repository.utils.ts', () => ({ findRunSteps: vi.fn() }))
const lookup = vi.mocked(findRunSteps)
const createdAt = new Date('2026-11-10T10:00:00.000Z')
const records = () => (['planner', 'coder'] as const).map(role => ({
  run: { id: runA, createdAt },
  step: { id: role === 'planner' ? stepIds.plannerP1 : stepIds.coderC1, runId: runA, role },
}))
const tokenFor = (role: 'planner' | 'coder') => signStepToken(config.hmacKey, {
  runId: runA, createdAt, stepId: role === 'planner' ? stepIds.plannerP1 : stepIds.coderC1, role,
})
const eventFor = (headers: Record<string, string | undefined> = {}) => ({
  node: { req: { headers: { 'authorization': `Bearer ${tokenFor('planner')}`, 'x-run-id': runA, 'x-step-id': stepIds.plannerP1, ...headers } } },
  context: {},
}) as unknown as H3Event
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-10T10:01:00.000Z'))
  Object.assign(config, { hmacKey: 'test-hmac-key', hmacTokenExpiryMinutes: 15, databaseUrl: 'postgres://test' })
  lookup.mockReset().mockResolvedValue(records())
  log.mockClear()
})
// Restore timers even if an assertion fails; tests never mutate process.env.
afterEach(() => vi.useRealTimers())

async function rejected(event: H3Event, reason: string) {
  await expect(requireStepContext(event)).rejects.toMatchObject({ statusCode: 401, message: 'Unauthorized' })
  expect(event.context.step).toBeUndefined()
  expect(log).toHaveBeenCalledTimes(1)
  expect(log.mock.calls[0]?.[1]).toBe(reason)
  expect(JSON.stringify(log.mock.calls)).not.toContain(config.hmacKey)
  // Only the event argument contains the input headers; logged context must not.
  expect(JSON.stringify(log.mock.calls[0]?.slice(1))).not.toContain(tokenFor('planner'))
}

test('authenticates both roles and derives bindings only from stored records', async () => {
  const planner = eventFor()
  await requireStepContext(planner)
  const plan = { runId: runA, producerStepId: stepIds.plannerP1, name: 'plan' }
  expect(planner.context.step).toEqual({ runId: runA, stepId: stepIds.plannerP1, role: 'planner', inputs: [], outputs: [plan] })
  const coder = eventFor({ 'authorization': `Bearer ${tokenFor('coder')}`, 'x-step-id': stepIds.coderC1 })
  await requireStepContext(coder)
  expect(coder.context.step).toEqual({ runId: runA, stepId: stepIds.coderC1, role: 'coder', inputs: [plan], outputs: [] })
  expect(lookup).toHaveBeenCalledTimes(2)
  expect(log).not.toHaveBeenCalled()
})

test('missing or malformed credentials fail before any database lookup', async () => {
  for (const headers of [
    { authorization: undefined }, { authorization: 'Bearer bad' }, { authorization: `Basic ${tokenFor('planner')}` },
    { 'x-run-id': undefined }, { 'x-run-id': 'not-a-uuid' }, { 'x-step-id': undefined }, { 'x-step-id': 'invalid' },
  ]) {
    log.mockClear()
    await rejected(eventFor(headers), 'missing_or_malformed_credentials')
  }
  expect(lookup).not.toHaveBeenCalled()
})

test('unknown runs and steps and cross-run IDs have generic 401 responses', async () => {
  lookup.mockResolvedValueOnce([])
  await rejected(eventFor({ 'x-run-id': runB }), 'run_or_step_not_found')
  log.mockClear()
  await rejected(eventFor({ 'x-step-id': stepIds.plannerRunB }), 'run_or_step_not_found')
})

test('a planner token cannot authenticate the coder step', async () => {
  await rejected(eventFor({ 'x-step-id': stepIds.coderC1 }), 'invalid_hmac')
})

test('expiry uses the stored creation time and configured window', async () => {
  config.hmacTokenExpiryMinutes = '1'
  await rejected(eventFor(), 'token_expired')
})

test('invalid signatures cannot reuse a pre-established context', async () => {
  const event = eventFor({ authorization: `Bearer ${'0'.repeat(64)}` })
  Reflect.set(event.context, 'step', { role: 'planner' })
  await rejected(event, 'invalid_hmac')
})

test('invalid stored workflow shape fails closed', async () => {
  lookup.mockResolvedValueOnce(records().slice(0, 1))
  await rejected(eventFor(), 'invalid_workflow')
})

test('missing signing/database settings or invalid expiry is 503 without a lookup', async () => {
  for (const missing of [
    { hmacKey: '' }, { databaseUrl: '' }, { hmacTokenExpiryMinutes: 0 },
    { hmacTokenExpiryMinutes: -1 }, { hmacTokenExpiryMinutes: 'bad' }, { hmacTokenExpiryMinutes: Infinity },
  ]) {
    Object.assign(config, { hmacKey: 'test-hmac-key', databaseUrl: 'postgres://test', hmacTokenExpiryMinutes: 15 }, missing)
    await expect(requireStepContext(eventFor())).rejects.toMatchObject({ statusCode: 503, message: 'Authentication is not configured' })
  }
  expect(lookup).not.toHaveBeenCalled()
})
