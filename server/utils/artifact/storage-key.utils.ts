/**
 * Mapping from artifact references to physical blob keys.
 * @module
 */
import { artifactRefSchema } from '../../../shared/utils/zod-schemas/caller-context.schema.ts'

/**
 * Derive the blob key for an artifact: `v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}`.
 * Accepts a server-selected reference, never an HTTP path or key override.
 * @param reference - Validated against the artifact reference schema.
 * @throws TypeError when `reference` is not a valid artifact reference.
 */
export function artifactStorageKey(reference: unknown): string {
  const parsed = artifactRefSchema.safeParse(reference)
  if (!parsed.success) {
    throw new TypeError('Invalid artifact reference')
  }
  const { runId, producerStepId, name } = parsed.data
  return `v1/runs/${runId}/steps/${producerStepId}/artifacts/${name}`
}
