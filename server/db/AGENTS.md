# Database instructions

Applies to `server/db/**`, in addition to the root and [server instructions](../AGENTS.md).

## Schema and migrations

- Use PostgreSQL 17 with Drizzle and node-postgres. Keep connections, schemas, and migrations server-side; export client-safe types through `shared/`.
- Separate request and persistence schemas. Allowlist inputs and derive ownership and identity from trusted context.
- Generate and review migrations. Preserve existing data and test migrations in a disposable database; do not silently apply them to shared or production databases.
- Store instants as `timestamptz` with UTC sessions. Reserve timezone-independent columns for wall-clock or calendar values.
- Define timestamp updates explicitly; insert defaults do not handle later writes. Check existing hooks/triggers, keep `createdAt` fixed, and leave reads and failed operations timestamp-neutral.
- Pass native objects to JSON/JSONB columns; do not double-encode. Match date values to Drizzle's column mapping.
- Reuse [shared status constants](../../shared/AGENTS.md#schemas-and-constants).

## Artifact persistence

- Follow the [persistence contract](../../docs/api/implementation.md#persistence-and-workflow-ownership) for fields, constraints, migrations, and timestamp behavior.
- Persist one current artifact per step/name with stable IDs across retries. Reference workflow-owned run/step tables; do not duplicate their ownership or add attempt history.
- Scope existence queries to any granted action and discovery to read access. Follow the [server authorization rules](../AGENTS.md#guards-and-validation); do not use unrestricted ID lookups.
- Verify constraints, stable IDs, report replacement, timestamps, and restart durability against disposable PostgreSQL, not mocks.

References: [Drizzle columns](https://orm.drizzle.team/docs/column-types), [updates](https://orm.drizzle.team/docs/update), and [migrations](https://orm.drizzle.team/docs/migrations).
