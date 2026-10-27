import type { CallerContext } from '#shared/types/artifact'

declare module 'h3' {
  interface H3EventContext {
    // Validated by requireCallerContext; only trusted middleware may supply it.
    caller?: CallerContext
  }
}

export {}
