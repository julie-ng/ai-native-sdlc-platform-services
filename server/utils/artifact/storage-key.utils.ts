import { artifactRefSchema } from '../../../shared/utils/zod-schemas/caller-context.schema.ts'

// Accept a server-selected reference, never an HTTP path or key override.
export function artifactStorageKey(reference: unknown): string {
  const parsed = artifactRefSchema.safeParse(reference)
  if (!parsed.success) {
    throw new TypeError('Invalid artifact reference')
  }
  const { runId, producerStepId, name } = parsed.data
  return `v1/runs/${runId}/steps/${producerStepId}/artifacts/${name}`
}
