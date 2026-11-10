import { createArtifactRequestSchema } from '#shared/utils/zod-schemas/artifact.schema'
import { useDB } from '#server/db/use-db'
import { requireArtifactPermission } from '#server/utils/guards/require-artifact-access'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration'
import { requireStepContext } from '#server/utils/guards/require-step-context'
import { signUpload } from '#server/utils/artifact/azure-sas.utils'
import { preventCaching, readArtifactBody } from '#server/utils/artifact/http.utils'
import { upsertArtifact } from '#server/utils/artifact/repository.utils'
import { useArtifactStorage } from '#server/utils/artifact/use-artifact-storage'

// Register (201) or re-register (200) the caller's own artifact and issue an upload SAS.
export default defineEventHandler(async (event) => {
  await requireStepContext(event)
  const { name, ...metadata } = await readArtifactBody(event, createArtifactRequestSchema)
  preventCaching(event)
  requireArtifactConfiguration(event)
  // The producing step comes from the caller, never the request body.
  const step = event.context.step!
  const reference = { runId: step.runId, producerStepId: step.stepId, name }
  // The upload SAS can overwrite (`sp=w`), so it needs both permissions.
  requireArtifactPermission(event, reference, ['create', 'update'])
  const { record, created } = await upsertArtifact(useDB(), reference, metadata)
  // If signing fails the registration stays; a repeated POST signs again.
  const upload = await signUpload(useArtifactStorage(event), record)
  setResponseStatus(event, created ? 201 : 200)
  return { id: record.id, state: record.state, upload }
})
