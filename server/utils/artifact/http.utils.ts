import { createError, getValidatedRouterParams, readValidatedBody, setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { artifactIdParametersSchema } from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import type { ServiceResult } from './ports.ts'

function orBadRequest<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    // Field paths and messages only; Zod messages do not echo input values.
    throw createError({ statusCode: 400, message: 'Invalid request', data: z.flattenError(result.error) })
  }
  return result.data
}

// Strict schemas reject unknown fields; malformed JSON is already a 400 from h3.
export async function readArtifactBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  return orBadRequest(await readValidatedBody(event, body => schema.safeParse(body)))
}

export async function readArtifactId(event: H3Event): Promise<string> {
  return orBadRequest(await getValidatedRouterParams(event, params => artifactIdParametersSchema.safeParse(params))).id
}

// SAS URLs are short-lived capabilities; keep them out of caches.
export function preventCaching(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}

export function sendServiceResult<T>(event: H3Event, result: ServiceResult<T>): T {
  if (!result.ok) {
    throw createError({ statusCode: result.status, message: result.message })
  }
  setResponseStatus(event, result.status)
  return result.body
}
