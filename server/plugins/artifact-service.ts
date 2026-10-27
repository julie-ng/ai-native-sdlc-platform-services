import { closeArtifactService } from '#server/utils/artifact/use-artifact-service'

// Release the database pool when Nitro shuts down.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', closeArtifactService)
})
