/**
 * HTTP boundary helpers for the artifact routes: validated input, cache headers and
 * the public projection of stored records.
 * @module
 */
import { createError, getValidatedRouterParams, readValidatedBody, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ArtifactInfo } from '../../../shared/types/artifact.ts'
import { artifactIdParametersSchema } from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import type { ArtifactRecord } from './repository.utils.ts'

/**
 * Unwrap a Zod parse result or throw a 400.
 * @param result - Zod validation result for request input.
 * @returns The parsed input when validation succeeds.
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
 * @returns The validated body with its schema-inferred shape.
 * @throws H3Error 400 when the body is invalid.
 */
export async function readArtifactBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  return orBadRequest(await readValidatedBody(event, body => schema.safeParse(body)))
}

/**
 * Read and validate the `id` route parameter.
 * @param event - Request containing the id route parameter.
 * @returns The artifact ID as a canonical UUID v4.
 * @throws H3Error 400 when the parameter is not a valid ID.
 */
export async function readArtifactId(event: H3Event): Promise<string> {
  return orBadRequest(await getValidatedRouterParams(event, params => artifactIdParametersSchema.safeParse(params))).id
}

/**
 * Send `Cache-Control: no-store`. SAS URLs are short-lived capabilities; keep them out of caches.
 * @param event - Response receiving the no-store cache directive.
 */
export function preventCaching(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}

/**
 * Project a stored record onto its public metadata. Select public fields explicitly;
 * internal references and SAS URLs never leave. Absent optional fields are omitted.
 * @param record - Stored record already authorized for metadata reads.
 * @returns Public metadata appropriate to the current upload state, without internal references.
 */
export function toArtifactInfo(record: ArtifactRecord): ArtifactInfo {
  const { contentType, kind, title, description } = record.metadata
  const common = {
    id: record.id,
    name: record.reference.name,
    contentType,
    ...(kind === undefined ? {} : { kind }),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  const details = record.details === undefined ? {} : { details: record.details }
  switch (record.state) {
    case 'uploaded':
      // The database CHECK constraint guarantees size and hash for uploaded records.
      return { ...common, state: 'uploaded', sizeBytes: record.sizeBytes!, sha256: record.sha256!, ...details }
    case 'failed':
      return { ...common, state: 'failed', ...details }
    case 'reserved':
      return { ...common, state: 'reserved' }
  }
}
