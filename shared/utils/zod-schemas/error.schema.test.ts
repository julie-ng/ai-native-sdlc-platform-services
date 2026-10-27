import assert from 'node:assert/strict'
import { test } from 'node:test'
import { error400Schema, error403Schema, error503Schema } from './error.schema.ts'

test('only validation errors accept field details and all error objects are closed', () => {
  const error = { code: 'INVALID_REQUEST', message: 'invalid request', fields: [{ path: '/id', code: 'format' }] }
  assert(error400Schema.safeParse({ error }).success)
  assert(!error400Schema.safeParse({ error: { ...error, fields: [] } }).success)
  assert(!error400Schema.safeParse({ error: { ...error, fields: [{ path: '/id', code: 'format', value: 'untrusted' }] } }).success)
  const forbidden = { code: 'FORBIDDEN', message: 'forbidden' }
  assert(error403Schema.safeParse({ error: forbidden }).success)
  assert(!error403Schema.safeParse({ error: { ...forbidden, fields: error.fields } }).success)
  assert(!error403Schema.safeParse({ error: { ...forbidden, artifact: { title: 'secret' } } }).success)
})

test('unavailable errors distinguish missing caller context from dependency failure', () => {
  for (const code of ['CALLER_CONTEXT_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE']) {
    assert(error503Schema.safeParse({ error: { code, message: 'unavailable' } }).success)
  }
  assert(!error503Schema.safeParse({ error: { code: 'UNAVAILABLE', message: 'unavailable' } }).success)
})
