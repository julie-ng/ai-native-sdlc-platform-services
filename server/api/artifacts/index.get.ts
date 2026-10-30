import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { sendServiceResult } from '#server/utils/artifact/http.utils'
import { useArtifactService } from '#server/utils/artifact/use-artifact-service'

// Discover readable artifact metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  return sendServiceResult(event, await useArtifactService().listArtifacts(event.context.caller!))
})
