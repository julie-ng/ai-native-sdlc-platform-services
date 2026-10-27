import { completeArtifactRequestSchema } from '#shared/utils/zod-schemas/artifact.schema'
import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { readArtifactBody, readArtifactId, sendServiceResult } from '#server/utils/artifact/http.utils'
import { useArtifactService } from '#server/utils/artifact/use-artifact-service'

// Report a successful direct upload to Azure. Reported, not verified, size/hash.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const id = await readArtifactId(event)
  const body = await readArtifactBody(event, completeArtifactRequestSchema)
  return sendServiceResult(event, await useArtifactService().completeArtifact(event.context.caller!, id, body))
})
