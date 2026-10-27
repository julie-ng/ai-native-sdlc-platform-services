import { z } from 'zod'

export const fieldErrorSchema = z.strictObject({
  path: z.string().max(256),
  code: z.enum(['required', 'type', 'format', 'range', 'unknown_field']),
})
const messageSchema = z.string().min(1).max(256)

// Only invalid-request responses expose field categories, never input values.
export const error400Schema = z.strictObject({
  error: z.strictObject({
    code: z.literal('INVALID_REQUEST'),
    message: messageSchema,
    fields: z.array(fieldErrorSchema).min(1).max(20),
  }),
})
function errorSchema<const C extends string>(code: C) {
  return z.strictObject({ error: z.strictObject({ code: z.literal(code), message: messageSchema }) })
}
export const error403Schema = errorSchema('FORBIDDEN')
export const error404Schema = errorSchema('ARTIFACT_NOT_FOUND')
export const error405Schema = errorSchema('METHOD_NOT_ALLOWED')
export const error409Schema = errorSchema('CONFLICT')
export const error413Schema = errorSchema('REQUEST_TOO_LARGE')
export const error415Schema = errorSchema('UNSUPPORTED_MEDIA_TYPE')
export const error500Schema = errorSchema('INTERNAL_ERROR')
export const error503Schema = z.strictObject({
  error: z.strictObject({
    code: z.enum(['CALLER_CONTEXT_UNAVAILABLE', 'DEPENDENCY_UNAVAILABLE']),
    message: messageSchema,
  }),
})
export const errorResponseSchema = z.union([
  error400Schema, error403Schema, error404Schema, error405Schema, error409Schema,
  error413Schema, error415Schema, error500Schema, error503Schema,
])
