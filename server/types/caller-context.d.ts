import type { CallerContext } from '#shared/types/artifact'

declare module 'h3' {
  interface H3EventContext {
    // Set only by the requireCallerContext guard; never from HTTP input.
    caller?: CallerContext
  }
}

export {}
