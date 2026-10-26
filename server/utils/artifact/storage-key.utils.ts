import { isArtifactValue } from '../../../shared/utils/artifact-schemas/validation.utils.ts'

// Accept a server-selected reference, never an HTTP path or key override.
export function artifactStorageKey(reference: unknown): string {
  if (!isArtifactValue('ArtifactRef', reference)) {
    throw new TypeError('Invalid artifact reference')
  }
  return `v1/runs/${reference.runId}/steps/${reference.producerStepId}/artifacts/${reference.name}`
}
