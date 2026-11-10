import { migrateDatabase } from '#server/db/migrate'
import { useLogger } from '#server/utils/use-logger'

// Production builds migrate their configured database at startup; `/readyz` fails until this
// completes. Development skips it: `npm run dev` may point at a shared database with a personal
// role, which would then own the tables (use `npm run db:migrate` locally).
// Nitro does not await plugins, so a failure exits the process and Kubernetes restarts the pod.
export default defineNitroPlugin(() => {
  if (import.meta.dev) {
    return
  }
  migrateDatabase().then(
    () => useLogger('db').info('Database migrations applied'),
    (error) => {
      useLogger('db').fatal({ err: error }, 'Database migrations failed')
      process.exit(1)
    },
  )
})
