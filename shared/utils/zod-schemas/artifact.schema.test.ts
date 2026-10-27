import { expect, test } from 'vitest'
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
    expect(createArtifactRequestSchema.safeParse(value).success).toBe(false)
    expect(value).toStrictEqual(before)
  }
  expect(completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes: '5', sha256: 'a'.repeat(64) }).success).toBe(false)
})

test('completion boundaries, invalid states and malformed descriptive metadata', () => {
  for (const sizeBytes of [-1, 0.5, 104857601, null]) {
    expect(completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }).success).toBe(false)
  }
  for (const sizeBytes of [0, 104857600]) {
    expect(completeArtifactRequestSchema.safeParse({ state: 'uploaded', sizeBytes, sha256: 'a'.repeat(64) }).success).toBe(true)
  }
  for (const state of ['reserved', 'complete', null]) {
    expect(completeArtifactRequestSchema.safeParse({ state, sizeBytes: 5, sha256: 'a'.repeat(64) }).success).toBe(false)
  }
  const valid = { name: 'plan', contentType: 'text/markdown' }
  for (const extra of [{ title: '' }, { title: 'a\nb' }, { title: 'a'.repeat(161) }, { description: 'a'.repeat(2001) }, { kind: 'a/b' }]) {
    expect(createArtifactRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false)
  }
})

test('valid requests retain wire values; write acknowledgments exclude stored metadata', () => {
  const request = { name: 'plan', contentType: 'text/markdown', title: 'Implementation plan' }
  const parsed = createArtifactRequestSchema.safeParse(request)
  expect(parsed.success).toBe(true)
  expect(parsed.data).toStrictEqual(request)
  const acknowledgment = { id: '40000000-0000-4000-8000-000000000001', state: 'uploaded' }
  expect(completeArtifactResponseSchema.safeParse(acknowledgment).success).toBe(true)
  expect(completeArtifactResponseSchema.safeParse({ ...acknowledgment, title: 'Stored metadata' }).success).toBe(false)
})
