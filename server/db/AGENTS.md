# Database instructions

Applies to `server/db/**`, in addition to the root and [server instructions](../AGENTS.md).

- Drizzle is the chosen ORM. It is not installed yet; no database engine, driver, schema, connection helper, or migration commands exist. Check [open decisions](../../docs/architecture.md#open-decisions) before adding them.
- Keep database connections, schemas, and migrations server-side. Export request-safe types through `shared/` without pulling database runtime code into the client.
- Distinguish HTTP request schemas from database insert/update schemas. Accept only allowed fields; derive ownership, identity, and other server-controlled values from trusted context.
- Generate and review migrations when schemas change. Preserve existing data and verify migration behavior in an appropriate disposable database; do not silently apply migrations to a shared or production database.
- For PostgreSQL, store instants as `timestamp(..., { withTimezone: true })` (`timestamptz`). Reserve timezone-independent values for actual wall-clock or calendar concepts. Do not assume the database engine or server timezone has been selected.
- Define the `updatedAt` mechanism explicitly. An insert default does not update a row on later writes. Check the schema for application hooks or database triggers before adding manual updates.
- Pass native objects to JSON/JSONB columns; do not double-encode them with `JSON.stringify`. Match date values to the configured Drizzle column mapping.
- Share status constants and runtime value lists rather than hardcoding strings across the schema, validation, and handlers. Read [shared instructions](../../shared/AGENTS.md) when adding them.

References: [Drizzle column types](https://orm.drizzle.team/docs/column-types), [updates](https://orm.drizzle.team/docs/update), and [migrations](https://orm.drizzle.team/docs/migrations). Verify against the selected engine and installed version when implementation begins.
