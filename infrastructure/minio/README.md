# MinIO object storage

MinIO runs from `../docker-compose.yml` (core layer). The API creates two buckets on start:

| Bucket | Contents | Lifecycle |
|---|---|---|
| `attachments` | Photos of ANC cards, lab reports (uploaded from a patient's page) | kept |
| `backups` | Gzipped NDJSON backups made from Admin → *Back up now* | expire after 30 days |

Console: http://localhost:9001 (minioadmin / minioadmin).
