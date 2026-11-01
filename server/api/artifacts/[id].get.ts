import { requireArtifactAccess } from '#server/utils/guards/require-artifact-access'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { readArtifactId, toArtifactInfo } from '#server/utils/artifact/http.utils'

// Read one artifact's metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const id = await readArtifactId(event)
  requireArtifactConfiguration(event)
  await requireArtifactAccess(event, id, () => 'read')
  return toArtifactInfo(event.context.artifact!)
})
