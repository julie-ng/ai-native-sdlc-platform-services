/**
 * HTTP boundary helpers for the artifact routes: validated input, cache headers and
 * mapping service results to responses.
 * @module
 */
import { createError, getValidatedRouterParams, readValidatedBody, setResponseHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { artifactIdParametersSchema } from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import type { ServiceResult } from './ports.ts'

/**
 * Unwrap a Zod parse result or throw a 400.
 * @throws H3Error 400 with `z.flattenError()` output as `data`.
 */
function orBadRequest<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    // Field paths and messages only; Zod messages do not echo input values.
    throw createError({ statusCode: 400, message: 'Invalid request', data: z.flattenError(result.error) })
  }
  return result.data
}

/**
 * Read and validate a JSON request body. Strict schemas reject unknown fields;
 * malformed JSON is already a 400 from h3.
 * @param event - The request event.
 * @param schema - Strict Zod schema for the body.
 * @throws H3Error 400 when the body is invalid.
 */
export async function readArtifactBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  return orBadRequest(await readValidatedBody(event, body => schema.safeParse(body)))
}

/**
 * Read and validate the `id` route parameter.
 * @returns The artifact ID as a canonical UUID v4.
 * @throws H3Error 400 when the parameter is not a valid ID.
 */
export async function readArtifactId(event: H3Event): Promise<string> {
  return orBadRequest(await getValidatedRouterParams(event, params => artifactIdParametersSchema.safeParse(params))).id
}

/** Send `Cache-Control: no-store`. SAS URLs are short-lived capabilities; keep them out of caches. */
export function preventCaching(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}

/**
 * Turn a {@link ServiceResult} into an HTTP response.
 * @returns The result body, after setting the success status.
 * @throws H3Error with the failure status and message when `result.ok` is false.
 */
export function sendServiceResult<T>(event: H3Event, result: ServiceResult<T>): T {
  if (!result.ok) {
    throw createError({ statusCode: result.status, message: result.message })
  }
  setResponseStatus(event, result.status)
  return result.body
}
