import { closeDB } from '#server/db/use-db'

// Release the shared database pool when Nitro shuts down (e.g. SIGTERM during a Kubernetes rollout).
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', closeDB)
})
