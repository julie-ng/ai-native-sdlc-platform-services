import { requireArtifactAccess } from '#server/utils/guards/require-artifact-access'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireStepContext } from '#server/utils/guards/require-step-context'
import { signDownload } from '#server/utils/artifact/azure-sas.utils'
import { preventCaching, readArtifactId } from '#server/utils/artifact/http.utils'
import { useArtifactStorage } from '#server/utils/artifact/use-artifact-storage'

// Issue a just-in-time download SAS; 409 until an upload has been reported.
export default defineEventHandler(async (event) => {
  requireStepContext(event)
  const id = await readArtifactId(event)
  preventCaching(event)
  requireArtifactConfiguration(event)
  await requireArtifactAccess(event, id, () => 'read')
  const record = event.context.artifact!
  if (record.state !== 'uploaded') {
    throw createError({ statusCode: 409, message: 'No successful upload has been reported' })
  }
  return signDownload(useArtifactStorage(event), record)
})
