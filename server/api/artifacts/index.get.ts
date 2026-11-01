import { useDB } from '#server/db/use-db'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { toArtifactInfo } from '#server/utils/artifact/http.utils'
import { readableArtifactReferences } from '#server/utils/artifact/policy.utils'
import { listArtifactsByReferences } from '#server/utils/artifact/repository.utils'

// Discover readable artifact metadata. Never issues SAS URLs.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  requireArtifactConfiguration(event)
  const records = await listArtifactsByReferences(useDB(), readableArtifactReferences(event.context.caller!))
  return { artifacts: records.map(toArtifactInfo) }
})
