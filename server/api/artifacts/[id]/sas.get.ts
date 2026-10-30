import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { preventCaching, readArtifactId, sendServiceResult } from '#server/utils/artifact/http.utils'
import { useArtifactService } from '#server/utils/artifact/use-artifact-service'

// Issue a just-in-time download SAS; 409 until an upload has been reported.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const id = await readArtifactId(event)
  preventCaching(event)
  return sendServiceResult(event, await useArtifactService().getArtifactSas(event.context.caller!, id))
})
