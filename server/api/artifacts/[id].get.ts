import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { readArtifactId, sendServiceResult } from '#server/utils/artifact/http.utils'
import { useArtifactService } from '#server/utils/artifact/use-artifact-service'

// Read one artifact's metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const id = await readArtifactId(event)
  return sendServiceResult(event, await useArtifactService().getArtifact(event.context.caller!, id))
})
