# Database design

## Server (PostgreSQL)

| Table | Purpose | Key points |
|---|---|---|
| `users` | Health workers, doctors/supervisors, admins, patients | bcrypt password hash; `wards` array controls access; optional `email` for Google sign-in; `patient_id` links a patient account to her own record (read-only) |
| `devices` | Every phone/browser that synced | last seen, last pulled sequence, pending count it reported |
| `records` | Patients, pregnancies, visits as JSON documents | **Partitioned by ward** (`records_ward_1`, `_2`, `_3`, `_other`); `field_meta` stores who/when/which device wrote each field; `vv` is the record's version vector; `server_seq` is the global change number used by pull; `deleted` is a tombstone |
| `sync_events` | Append-only log of every event received | `event_id UNIQUE` = idempotency; keeps the original change, the writer's seen version vector, HLC and the merge result |
| `conflicts` | Clinical readings that disagree | `observations` holds every concurrent value with its author; one open conflict per record+field (partial unique index) |
| `outbox` | Events waiting to go to Kafka | written in the same transaction as the record change |
| `audit_log` | Sign-ins, resolutions, failovers, backups | |
| `attachments` | Metadata of files stored in MinIO | the file itself is in object storage |
| `app_settings` | Sync mode (safe / naive) | |
| `an_*` | Results of Spark jobs | daily visits, village stats, monthly registrations, follow-up completion, stream counts, job runs |

Views `patients_v`, `pregnancies_v`, `visits_v` show the JSON documents as ordinary columns for reports.

### Example `records` row

```json
{
  "id": "6f1c…", "ward": "ward-1", "entity": "pregnancy",
  "data": { "patientId": "a12…", "lmp": "2026-05-02", "bpSystolic": 118, "bpDiastolic": 78, "riskLevel": "low" },
  "field_meta": {
    "bpSystolic": { "dot": { "d": "dev-730c98a1", "c": 14 }, "hlc": "001795139356072:00000:dev-730c98a1",
                    "userName": "Sita Tamang", "deviceId": "dev-730c98a1" }
  },
  "vv": { "seed-device": 212, "dev-730c98a1": 14 },
  "version": 3, "server_seq": 801, "open_conflicts": 0
}
```

## Phone (IndexedDB via Dexie)

| Store | Purpose |
|---|---|
| `records` | Local copy of every record in the worker's ward(s); the app reads only from here |
| `outbox` | Change queue: `PENDING` → `SYNCED` (after server acknowledgement) or `REJECTED` |
| `conflicts` | Conflicts pulled from the server |
| `syncLog` | History of sync attempts (duration, bytes before/after gzip) |
| `meta` | `lastSeq` (pull cursor), `counter` (this device's event counter) |

### Example outbox event

```json
{
  "eventId": "0b7e…", "schemaVersion": 2, "deviceId": "dev-730c98a1",
  "entity": "pregnancy", "recordId": "6f1c…", "ward": "ward-1", "op": "UPDATE",
  "changes": { "bpSystolic": 118, "bpDiastolic": 78 },
  "before": { "bpSystolic": 116, "bpDiastolic": 79 },
  "seenVV": { "seed-device": 212 }, "dot": { "d": "dev-730c98a1", "c": 14 },
  "hlc": "001795139356072:00000:dev-730c98a1", "status": "PENDING"
}
```

## Kafka topics

| Topic | Contents | Key |
|---|---|---|
| `patient-events` | patient creates/updates | ward |
| `maternal-health-events` | pregnancy changes and conflict resolutions | ward |
| `clinic-visit-events` | visits | ward |
| `sync-events` | one message per processed sync event (status, conflicts) | ward |

3 partitions each. Replication factor 1 in the single-broker setup, 3 with `docker-compose.kafka-cluster.yml`.
