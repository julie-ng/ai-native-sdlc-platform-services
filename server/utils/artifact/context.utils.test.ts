import { expect, test } from 'vitest'
import { contexts, planP1, runA, runB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import { readStepContext } from './context.utils.ts'

for (const [name, step] of Object.entries(contexts)) {
  test(`established context: ${name}`, () => {
    expect(readStepContext({ step, unrelatedContextField: true })).toStrictEqual({ ok: true, value: step })
  })
}

test('context fails closed when missing, a role string or incomplete', () => {
  for (const value of [null, 'planner', { runId: runA }]) {
    expect(readStepContext({ step: value })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})

test('does not resolve tokens, authenticate or trust HTTP claims', () => {
  const planner = contexts['planner-p1']
  for (const context of [null, undefined, 'planner', {}, { token: 'planner-p1' }, { body: { step: planner } }, { query: planner }, { headers: { 'x-step-context': JSON.stringify(planner) } }]) {
    expect(readStepContext(context)).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
  for (const extra of [{ role: 'admin' }, { permissions: ['read-all'] }, { attemptId: '30000000-0000-4000-8000-000000000001' }, { grants: ['read-all'] }]) {
    expect(readStepContext({ step: { ...planner, ...extra } })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})

test('rejects cross-run bindings and outputs owned by another step', () => {
  const step = contexts['planner-p1']
  for (const changed of [
    { ...step, outputs: [{ ...planP1, runId: runB }] },
    { ...step, inputs: [{ ...planP1, runId: runB }] },
    { ...step, outputs: [{ ...planP1, producerStepId: stepIds.plannerP2 }] },
  ]) {
    expect(readStepContext({ step: changed })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})
