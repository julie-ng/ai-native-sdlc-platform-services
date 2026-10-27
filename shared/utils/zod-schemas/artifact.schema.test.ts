import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createArtifactRequestSchema, completeArtifactRequestSchema, completeArtifactResponseSchema } from './artifact.schema.ts'

test('validation does not coerce, trim, strip or default HTTP data', () => {
  for (const value of [
    { name: ' plan', contentType: 'text/markdown' },
    { name: 'plan', contentType: 'Text/Markdown' },
    { name: 'plan', contentType: 'text/markdown; charset=utf-8' },
    { name: 'plan', contentType: 'text/markdown', title: null },
    { name: 'plan', contentType: 'text/markdown', permissions: ['read'] },
  ]) {
    const before = structuredClone(value)
    assert(!createArtifactRequestSchema.safeParse(value).success)
    assert.deepEqual(value, before)
  }
  assert(!completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes: '5', sha256: 'a'.repeat(64) }).success)
})

test('completion boundaries, invalid states and malformed descriptive metadata', () => {
  for (const sizeBytes of [-1, 0.5, 104857601, null]) {
    assert(!completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }).success)
  }
  for (const sizeBytes of [0, 104857600]) {
    assert(completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }).success)
  }
  for (const state of ['reserved', 'complete', null]) {
    assert(!completeArtifactRequestSchema.safeParse({ state, sizeBytes: 5, sha256: 'a'.repeat(64) }).success)
  }
  const valid = { name: 'plan', contentType: 'text/markdown' }
  for (const extra of [{ title: '' }, { title: 'a\nb' }, { title: 'a'.repeat(161) }, { description: 'a'.repeat(2001) }, { kind: 'a/b' }]) {
    assert(!createArtifactRequestSchema.safeParse({ ...valid, ...extra }).success)
  }
})

test('valid requests retain wire values; write acknowledgments exclude stored metadata', () => {
  const request = { name: 'plan', contentType: 'text/markdown', title: 'Implementation plan' }
  const parsed = createArtifactRequestSchema.safeParse(request)
  assert(parsed.success)
  assert.deepEqual(parsed.data, request)
  const acknowledgment = { id: '40000000-0000-4000-8000-000000000001', state: 'uploaded' }
  assert(completeArtifactResponseSchema.safeParse(acknowledgment).success)
  assert(!completeArtifactResponseSchema.safeParse({ ...acknowledgment, title: 'Stored metadata' }).success)
})
