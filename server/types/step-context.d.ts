import type { StepContext } from '#shared/types/artifact'
import type { ArtifactRecord } from '#server/utils/artifact/repository.utils'

declare module 'h3' {
  interface H3EventContext {
    // Set only by the requireStepContext guard; never from HTTP input.
    step?: StepContext
    // Set only by the requireArtifactAccess guard, after authorizing the caller.
    artifact?: ArtifactRecord
  }
}

export {}
