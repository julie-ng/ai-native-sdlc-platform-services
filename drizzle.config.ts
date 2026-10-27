import { defineConfig } from 'drizzle-kit'

// `db:generate` needs no database. `db:migrate` applies to NUXT_DATABASE_URL;
// never point it at a shared database without review.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL ?? '',
  },
})
