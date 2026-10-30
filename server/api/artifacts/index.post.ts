import { createArtifactRequestSchema } from '#shared/utils/zod-schemas/artifact.schema'
import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { preventCaching, readArtifactBody, sendServiceResult } from '#server/utils/artifact/http.utils'
import { useArtifactService } from '#server/utils/artifact/use-artifact-service'

// Register (201) or re-register (200) the caller's own artifact and issue an upload SAS.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const body = await readArtifactBody(event, createArtifactRequestSchema)
  preventCaching(event)
  return sendServiceResult(event, await useArtifactService().createArtifact(event.context.caller!, body))
})
