# Database instructions

Applies to `server/db/**`, in addition to the root and [server instructions](../AGENTS.md).

- Drizzle is the chosen ORM. It is not installed yet; no driver, schema, connection helper, or migration commands exist. The artifact contract proposes PostgreSQL 17 and node-postgres; that planning target does not provision a database. Check [open decisions](../../docs/architecture.md#open-decisions) before adding them.
- Keep database connections, schemas, and migrations server-side. Export request-safe types through `shared/` without pulling database runtime code into the client.
- Distinguish HTTP request schemas from database insert/update schemas. Accept only allowed fields; derive ownership, identity, and other server-controlled values from trusted context.
- Generate and review migrations when schemas change. Preserve existing data and verify migration behavior in an appropriate disposable database; do not silently apply migrations to a shared or production database.
- For PostgreSQL, store instants as `timestamp(..., { withTimezone: true })` (`timestamptz`). Reserve timezone-independent values for actual wall-clock or calendar concepts. Follow the artifact contract's PostgreSQL 17 target and UTC session requirement for that slice; do not assume an existing database connection or server timezone.
- Define the `updatedAt` mechanism and the mutations that advance it explicitly. An insert default does not update a row on later writes. Check the schema for application hooks or database triggers before adding manual updates; keep `createdAt` fixed and do not advance timestamps on reads or failed/denied operations.
- Pass native objects to JSON/JSONB columns; do not double-encode them with `JSON.stringify`. Match date values to the configured Drizzle column mapping.
- Share status constants and runtime value lists rather than hardcoding strings across the schema, validation, and handlers. Read [shared instructions](../../shared/AGENTS.md) when adding them.

## Artifact persistence handoff

- Read the [artifact persistence and workflow-ownership contract](../../docs/api/implementation.md#persistence-and-workflow-ownership) before schema/adapter work. Its exact field constraints, export names and migration prerequisites remain the reference; no deployed database or installed Drizzle/driver is assumed.
- Persist one current artifact per producing step/name. Preserve stable IDs across retries and repeated writes; use the workflow-owned step identity, not an artifact-to-attempt relationship. Workflow owns the minimal run/step schema and prerequisite migrations; artifact code must not create a competing workflow table owner or require workflow endpoints/attempt tracking.
- Require `createdAt` and `updatedAt` on artifact records, initially equal. Each accepted upload acknowledgment replaces latest size/hash/state and sets `updatedAt` and `uploadedAt` using one DB timestamp in the same update, including identical report retries. Matching registration/SAS renewal leaves the row unchanged; avoid automatic hooks that would make it advance `updatedAt`. Do not append upload/attempt history.
- Separate any-action-scoped existence queries from requested-action checks; discovery queries use readable scope only. Repository adapters must not expose unrestricted ID lookups to implement the 403/404 distinction from the [server instructions](../AGENTS.md#guards-and-validation).
- Use disposable PostgreSQL tests to verify the real step FK, unique step/name, stable IDs, latest-report replacement, timestamp lifecycle and restart durability. Do not claim these from mocks, schema generation or a build.

References: [Drizzle column types](https://orm.drizzle.team/docs/column-types), [updates](https://orm.drizzle.team/docs/update), and [migrations](https://orm.drizzle.team/docs/migrations). Verify against the selected engine and installed version when implementation begins.
