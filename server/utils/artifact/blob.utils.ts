/**
 * Mapping from artifact references to physical blob names.
 * @module
 */
import { artifactRefSchema } from '../../../shared/utils/zod-schemas/step-context.schema.ts'

/**
 * Derive the blob name for an artifact: `v1/runs/{runId}/steps/{producerStepId}/artifacts/{name}`.
 * Accepts a server-selected reference, never an HTTP path or blob name override.
 * @param reference - Validated against the artifact reference schema.
 * @returns The deterministic run/step/name path inside the artifact container.
 * @throws TypeError when `reference` is not a valid artifact reference.
 */
export function deriveBlobName(reference: unknown): string {
  const parsed = artifactRefSchema.safeParse(reference)
  if (!parsed.success) {
    throw new TypeError('Invalid artifact reference')
  }
  const {
    runId, producerStepId, name,
  } = parsed.data
  return `v1/runs/${runId}/steps/${producerStepId}/artifacts/${name}`
}
