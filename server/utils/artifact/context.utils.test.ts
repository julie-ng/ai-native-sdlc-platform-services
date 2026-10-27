import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contexts, examples } from '../../../tests/support/artifact-fixtures.ts'
import { readCallerContext } from './context.utils.ts'

for (const [name, caller] of Object.entries(contexts)) {
  test(`middleware context: ${name}`, () => {
    assert.deepEqual(readCallerContext({ caller, unrelatedMiddlewareField: true }), { ok: true, value: caller })
  })
}
for (const example of examples.invalidContexts) {
  test(`context fails closed: ${example.id}`, () => {
    assert.deepEqual(readCallerContext({ caller: example.value }), { ok: false, error: 'context_unavailable' })
  })
}

test('does not resolve tokens, authenticate or trust HTTP claims', () => {
  for (const context of [null, undefined, 'planner', {}, { token: 'planner-p1' }, { body: { caller: contexts['planner-p1'] } }, { query: contexts['planner-p1'] }, { headers: { 'x-caller-context': JSON.stringify(contexts['planner-p1']) } }]) {
    assert.deepEqual(readCallerContext(context), { ok: false, error: 'context_unavailable' })
  }
  const caller = contexts['planner-p1']!
  for (const extra of [{ role: 'admin' }, { permissions: ['read-all'] }, { attemptId: caller.stepId }, { grants: ['read-all'] }]) {
    assert.deepEqual(readCallerContext({ caller: { ...caller, ...extra } }), { ok: false, error: 'context_unavailable' })
  }
})

test('rejects cross-run bindings and outputs owned by another step', () => {
  const caller = contexts['planner-p1']!
  const ref = caller.outputs[0]!
  for (const changed of [
    { ...caller, outputs: [{ ...ref, runId: '10000000-0000-4000-8000-000000000002' }] },
    { ...caller, inputs: [{ ...ref, runId: '10000000-0000-4000-8000-000000000002' }] },
    { ...caller, outputs: [{ ...ref, producerStepId: contexts['planner-p2']!.stepId }] },
    { ...caller, outputs: Array.from({ length: 65 }, () => ref) },
    { ...caller, inputs: Array.from({ length: 65 }, () => ref) },
  ]) {
    assert.deepEqual(readCallerContext({ caller: changed }), { ok: false, error: 'context_unavailable' })
  }
})
