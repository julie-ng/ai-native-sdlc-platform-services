import { completeArtifactRequestSchema } from '#shared/utils/zod-schemas/artifact.schema'
import { useDB } from '#server/db/use-db'
import { requireArtifactAccess } from '#server/utils/guards/require-artifact-access'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireCallerContext } from '#server/utils/guards/require-caller-context'
import { readArtifactBody, readArtifactId } from '#server/utils/artifact/http.utils'
import { recordUploadReport } from '#server/utils/artifact/repository.utils'

// Report the outcome of a direct upload to Azure: uploaded (reported, not verified,
// size/hash) or failed, with optional details. Each report replaces the previous one.
export default defineEventHandler(async (event) => {
  requireCallerContext(event)
  const id = await readArtifactId(event)
  const report = await readArtifactBody(event, completeArtifactRequestSchema)
  requireArtifactConfiguration(event)
  // The first report on a reserved artifact needs create; later reports need update.
  await requireArtifactAccess(event, id, record => record.state === 'reserved' ? 'create' : 'update')
  await recordUploadReport(useDB(), id, report)
  // Acknowledgment only: a write-only caller must not read the stored metadata.
  return { id, state: report.state }
})
