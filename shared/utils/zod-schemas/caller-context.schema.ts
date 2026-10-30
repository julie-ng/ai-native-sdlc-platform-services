import { z } from 'zod'
import { nameSchema, uuidSchema } from './common.schema.ts'

export const artifactRefSchema = z.strictObject({
  runId: uuidSchema,
  producerStepId: uuidSchema,
  name: nameSchema,
})

// Only the server's caller guard may establish this context. Shape validation does not
// authenticate a caller. Cross-field ownership checks live in readCallerContext.
export const callerContextSchema = z.strictObject({
  runId: uuidSchema,
  stepId: uuidSchema,
  taskType: z.string().min(1).max(64),
  inputs: z.array(artifactRefSchema),
  outputs: z.array(artifactRefSchema),
})
