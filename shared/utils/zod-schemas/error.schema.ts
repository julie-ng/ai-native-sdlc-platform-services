import { z } from 'zod'

// Documents Nitro's createError() JSON for OpenAPI; routes do not build it by hand.
// Loose because Nitro owns the envelope (e.g. `url`, and `stack` in development).
// Errors never include artifact fields, SAS URLs or internal details.
export const errorResponseSchema = z.looseObject({
  statusCode: z.number().int().min(400).max(599),
  statusMessage: z.string().optional(),
  message: z.string(),
  // 400 only: z.flattenError() output for the rejected body or route parameters.
  data: z.unknown().optional(),
})
