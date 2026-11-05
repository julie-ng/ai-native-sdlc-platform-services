import { useDB } from '#server/db/use-db'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireStepContext } from '#server/utils/guards/require-step-context'
import { toArtifactInfo } from '#server/utils/artifact/http.utils'
import { readableArtifactReferences } from '#server/utils/artifact/policy.utils'
import { listArtifactsByReferences } from '#server/utils/artifact/repository.utils'

// Discover readable artifact metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  requireStepContext(event)
  requireArtifactConfiguration(event)
  const records = await listArtifactsByReferences(useDB(), readableArtifactReferences(event.context.step!))
  return { artifacts: records.map(toArtifactInfo) }
})
