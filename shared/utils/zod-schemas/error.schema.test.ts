import { expect, test } from 'vitest'
import { error400Schema, error403Schema, error503Schema } from './error.schema.ts'

test('only validation errors accept field details and all error objects are closed', () => {
  const error = { code: 'INVALID_REQUEST', message: 'invalid request', fields: [{ path: '/id', code: 'format' }] }
  expect(error400Schema.safeParse({ error }).success).toBe(true)
  expect(error400Schema.safeParse({ error: { ...error, fields: [] } }).success).toBe(false)
  expect(error400Schema.safeParse({ error: { ...error, fields: [{ path: '/id', code: 'format', value: 'untrusted' }] } }).success).toBe(false)
  const forbidden = { code: 'FORBIDDEN', message: 'forbidden' }
  expect(error403Schema.safeParse({ error: forbidden }).success).toBe(true)
  expect(error403Schema.safeParse({ error: { ...forbidden, fields: error.fields } }).success).toBe(false)
  expect(error403Schema.safeParse({ error: { ...forbidden, artifact: { title: 'secret' } } }).success).toBe(false)
})

test('unavailable errors distinguish missing caller context from dependency failure', () => {
  for (const code of ['CALLER_CONTEXT_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE']) {
    expect(error503Schema.safeParse({ error: { code, message: 'unavailable' } }).success).toBe(true)
  }
  expect(error503Schema.safeParse({ error: { code: 'UNAVAILABLE', message: 'unavailable' } }).success).toBe(false)
})
