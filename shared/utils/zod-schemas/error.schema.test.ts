import { expect, test } from 'vitest'
import { errorResponseSchema } from './error.schema.ts'

test('documents the Nitro error envelope without fixing its optional fields', () => {
  expect(errorResponseSchema.safeParse({ statusCode: 404, message: 'Artifact not found' }).success).toBe(true)
  expect(errorResponseSchema.safeParse({ error: true, url: '/api/artifacts', statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid request', data: { formErrors: [], fieldErrors: {} } }).success).toBe(true)
  expect(errorResponseSchema.safeParse({ statusCode: 200, message: 'ok' }).success).toBe(false)
  expect(errorResponseSchema.safeParse({ statusCode: 404 }).success).toBe(false)
})
