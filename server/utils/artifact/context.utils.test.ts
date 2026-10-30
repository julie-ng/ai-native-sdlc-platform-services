import { expect, test } from 'vitest'
import { contexts, planP1, runA, runB, stepIds } from '../../../tests/support/artifact-fixtures.ts'
import { readCallerContext } from './context.utils.ts'

for (const [name, caller] of Object.entries(contexts)) {
  test(`established context: ${name}`, () => {
    expect(readCallerContext({ caller, unrelatedContextField: true })).toStrictEqual({ ok: true, value: caller })
  })
}

test('context fails closed when missing, a role string or incomplete', () => {
  for (const value of [null, 'planner', { runId: runA }]) {
    expect(readCallerContext({ caller: value })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})

test('does not resolve tokens, authenticate or trust HTTP claims', () => {
  const planner = contexts['planner-p1']
  for (const context of [null, undefined, 'planner', {}, { token: 'planner-p1' }, { body: { caller: planner } }, { query: planner }, { headers: { 'x-caller-context': JSON.stringify(planner) } }]) {
    expect(readCallerContext(context)).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
  for (const extra of [{ role: 'admin' }, { permissions: ['read-all'] }, { attemptId: '30000000-0000-4000-8000-000000000001' }, { grants: ['read-all'] }]) {
    expect(readCallerContext({ caller: { ...planner, ...extra } })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})

test('rejects cross-run bindings and outputs owned by another step', () => {
  const caller = contexts['planner-p1']
  for (const changed of [
    { ...caller, outputs: [{ ...planP1, runId: runB }] },
    { ...caller, inputs: [{ ...planP1, runId: runB }] },
    { ...caller, outputs: [{ ...planP1, producerStepId: stepIds.plannerP2 }] },
  ]) {
    expect(readCallerContext({ caller: changed })).toStrictEqual({ ok: false, error: 'context_unavailable' })
  }
})
