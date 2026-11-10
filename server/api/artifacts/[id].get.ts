import { requireArtifactAccess } from '#server/utils/guards/require-artifact-access'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireStepContext } from '#server/utils/guards/require-step-context'
import { readArtifactId, toArtifactInfo } from '#server/utils/artifact/http.utils'

// Read one artifact's metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  await requireStepContext(event)
  const id = await readArtifactId(event)
  requireArtifactConfiguration(event)
  await requireArtifactAccess(event, id, () => 'read')
  return toArtifactInfo(event.context.artifact!)
})
