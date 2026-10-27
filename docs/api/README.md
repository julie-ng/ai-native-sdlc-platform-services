# Artifact API

One current file and metadata record per producing step/name. Retries and later executions reuse the artifact ID and blob; bytes transfer directly between callers and Azure Blob Storage.

Routes, service, PostgreSQL repository and Azure SAS issuer are implemented. Nothing sets the caller context yet: until authentication middleware exists, every artifact request returns 503 (see [open decisions](../architecture.md#open-decisions)).

## Operations

| Request | Result |
| --- | --- |
| `POST /api/artifacts` | Register or re-register the caller's artifact and issue an upload SAS. 201 for a new artifact; otherwise 200. |
| `PUT <upload SAS URL>` | Upload or overwrite directly in Azure. |
| `PUT /api/artifacts/{id}` | Report a successful upload: size and SHA-256. Returns 200. |
| `GET /api/artifacts` | List readable metadata. Returns 200, possibly an empty list. |
| `GET /api/artifacts/{id}` | Read reserved or uploaded metadata. Returns 200. |
| `GET /api/artifacts/{id}/sas` | Issue a download SAS. Returns 200; 409 until an upload is reported. |
| `GET <download SAS URL>` | Download directly from Azure. |

## Access policy

Trusted middleware supplies caller context; task policy and exact workflow bindings determine access. An artifact ID or claimed role grants nothing.

| Caller | Permitted operations |
| --- | --- |
| Planner | Create/overwrite its own bound `plan` and report uploads. No metadata or download access. |
| Coder | Discover, inspect, and download bound plans. No writes. |
| Other task types | No access. |

- A different step does not inherit ownership, even with the same task type.
- Missing artifact, or not visible (no granted action): 404. Visible but wrong action: 403. For example, a planner reading its own plan, or a coder reporting an upload.
- Write responses contain acknowledgments, not stored metadata. Metadata/list responses never contain SAS URLs.

## Upload lifecycle

1. Write the local file and POST its name/content type, with optional kind/title/description.
2. Upload using the returned SAS URL and headers.
3. After Azure succeeds, PUT `state: uploaded`, `sizeBytes`, and `sha256` to the artifact endpoint.
4. Consumers discover the artifact, request a download SAS, and fetch the file.

Repeated POSTs replace the descriptive metadata (last write wins; omitted optional fields are cleared) and issue a fresh SAS for the same artifact. State, size and hash are unchanged until the next upload report.

Each upload report replaces the latest size/hash. Reported size is limited to **1 MB (1,000,000 bytes)**; the service does not verify uploaded bytes or enforce their actual size.

## POC assumptions

- One plan per consumer; no cardinality checks. Discovery remains a collection.
- One active writer per step; consumers read after production. No artifact history, version selection, or overlapping-writer coordination.
- Planners retain their local file or regenerate it; they cannot recover previous output through this API.
- Metadata describes the last reported upload. Overwriting bytes and reporting them are separate operations; SAS URLs remain usable until expiry.

## References

- [Implementation contract](./implementation.md): validation, persistence, storage, and schema workflow.
- [OpenAPI](./artifact.openapi.json): generated request/response shapes.
