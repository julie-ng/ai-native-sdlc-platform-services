import type { CallerContext } from '#shared/types/artifact'
import type { ArtifactRecord } from '#server/utils/artifact/repository.utils'

declare module 'h3' {
  interface H3EventContext {
    // Set only by the requireCallerContext guard; never from HTTP input.
    caller?: CallerContext
    // Set only by the requireArtifactAccess guard, after authorizing the caller.
    artifact?: ArtifactRecord
  }
}

export {}
