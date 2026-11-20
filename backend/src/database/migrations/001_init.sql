-- RuralHealth Sync — initial schema
-- Relational tables for users/devices/audit, and a JSON document store for
-- health records (DDIA Ch.3: relational vs document model — we use both).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'worker')),
  wards         TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  device_id        TEXT PRIMARY KEY,
  user_id          INT REFERENCES users(id),
  user_agent       TEXT,
  app_version      TEXT,
  last_seen        TIMESTAMPTZ,
  last_sync_at     TIMESTAMPTZ,
  last_pull_seq    BIGINT NOT NULL DEFAULT 0,
  pending_reported INT NOT NULL DEFAULT 0,
  events_pushed    BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One global, monotonically increasing change sequence. Every change to a
-- record gets the next number; devices pull "everything after N".
CREATE SEQUENCE IF NOT EXISTS record_seq;
-- Counter used when the server itself writes (conflict resolutions, API writes).
CREATE SEQUENCE IF NOT EXISTS server_dot_seq;

-- Health records as JSON documents, PARTITIONED BY WARD (DDIA Ch.7 — sharding).
-- Each health post's data lives in its own partition, so it could be moved to
-- its own node, and a ward's sync query only touches its own partition.
CREATE TABLE IF NOT EXISTS records (
  id             UUID NOT NULL,
  ward           TEXT NOT NULL,
  entity         TEXT NOT NULL CHECK (entity IN ('patient', 'pregnancy', 'visit')),
  data           JSONB NOT NULL DEFAULT '{}',
  field_meta     JSONB NOT NULL DEFAULT '{}',   -- per-field {dot, hlc, userId, deviceId}
  vv             JSONB NOT NULL DEFAULT '{}',   -- version vector of the record
  version        INT NOT NULL DEFAULT 0,
  deleted        BOOLEAN NOT NULL DEFAULT FALSE, -- tombstone
  open_conflicts INT NOT NULL DEFAULT 0,
  server_seq     BIGINT NOT NULL,
  created_by     INT,
  updated_by     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ward, id)
) PARTITION BY LIST (ward);

CREATE TABLE IF NOT EXISTS records_ward_1 PARTITION OF records FOR VALUES IN ('ward-1');
CREATE TABLE IF NOT EXISTS records_ward_2 PARTITION OF records FOR VALUES IN ('ward-2');
CREATE TABLE IF NOT EXISTS records_ward_3 PARTITION OF records FOR VALUES IN ('ward-3');
CREATE TABLE IF NOT EXISTS records_other  PARTITION OF records DEFAULT;

CREATE INDEX IF NOT EXISTS records_id_idx      ON records (id);
CREATE INDEX IF NOT EXISTS records_seq_idx     ON records (server_seq);
CREATE INDEX IF NOT EXISTS records_entity_idx  ON records (entity);
CREATE INDEX IF NOT EXISTS records_patient_idx ON records ((data->>'patientId'));

-- Append-only log of every event received from a device. The unique event_id
-- makes pushes idempotent: retrying the same request can never apply twice.
CREATE TABLE IF NOT EXISTS sync_events (
  seq               BIGSERIAL PRIMARY KEY,
  event_id          UUID UNIQUE NOT NULL,
  device_id         TEXT NOT NULL,
  user_id           INT,
  entity            TEXT,
  record_id         UUID,
  ward              TEXT,
  op                TEXT,
  schema_version    INT,
  changes           JSONB,
  seen_vv           JSONB,
  dot               JSONB,
  hlc               TEXT,
  status            TEXT NOT NULL DEFAULT 'received',
  result            JSONB,
  client_created_at TIMESTAMPTZ,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_events_record_idx   ON sync_events (record_id);
CREATE INDEX IF NOT EXISTS sync_events_received_idx ON sync_events (received_at);

-- Clinical conflicts waiting for human review. "observations" keeps every concurrent
-- observation with who/when/which device — nothing is thrown away.
CREATE TABLE IF NOT EXISTS conflicts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id   UUID NOT NULL,
  ward        TEXT NOT NULL,
  entity      TEXT NOT NULL,
  field       TEXT NOT NULL,
  observations JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution  JSONB,
  resolved_by INT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conflicts_one_open ON conflicts (record_id, field) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS conflicts_record_idx ON conflicts (record_id);

-- Transactional outbox: written in the SAME transaction as the record change,
-- then published to Kafka by a separate publisher. Kafka can be down and no
-- event is lost; the database and the event stream never disagree.
CREATE TABLE IF NOT EXISTS outbox (
  id           BIGSERIAL PRIMARY KEY,
  topic        TEXT NOT NULL,
  key          TEXT,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id       BIGSERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id  INT,
  username TEXT,
  action   TEXT NOT NULL,
  target   TEXT,
  details  JSONB,
  ip       TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id    UUID NOT NULL,
  ward         TEXT NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INT,
  storage      TEXT NOT NULL,
  object_key   TEXT NOT NULL,
  uploaded_by  INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES ('sync_mode', '"safe"') ON CONFLICT DO NOTHING;

-- ---- Analytics tables (written by Spark jobs, read by the dashboard) --------
CREATE TABLE IF NOT EXISTS an_daily_visits (
  day DATE, ward TEXT, visit_type TEXT, visits BIGINT, computed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS an_village_stats (
  ward TEXT, village TEXT, patients BIGINT, pregnancies BIGINT, high_risk BIGINT, computed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS an_monthly_registrations (
  month TEXT, ward TEXT, registrations BIGINT, computed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS an_followup (
  ward TEXT, due BIGINT, completed BIGINT, completion_rate DOUBLE PRECISION, computed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS an_stream_counts (
  window_start TIMESTAMPTZ, window_end TIMESTAMPTZ, topic TEXT, ward TEXT, op TEXT, events BIGINT, computed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS an_job_runs (
  id BIGSERIAL PRIMARY KEY, job TEXT, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  duration_ms BIGINT, rows_in BIGINT, rows_out BIGINT, details JSONB
);

-- Readable views for reports and the paper.
CREATE OR REPLACE VIEW patients_v AS
  SELECT id, ward, data->>'name' AS name, (data->>'age')::int AS age, data->>'sex' AS sex,
         data->>'village' AS village, data->>'phone' AS phone, open_conflicts, version, created_at, updated_at
  FROM records WHERE entity = 'patient' AND NOT deleted;

CREATE OR REPLACE VIEW pregnancies_v AS
  SELECT id, ward, data->>'patientId' AS patient_id, data->>'lmp' AS lmp, data->>'edd' AS edd,
         data->>'riskLevel' AS risk_level, data->>'status' AS status, open_conflicts, updated_at
  FROM records WHERE entity = 'pregnancy' AND NOT deleted;

CREATE OR REPLACE VIEW visits_v AS
  SELECT id, ward, data->>'patientId' AS patient_id, data->>'type' AS visit_type,
         data->>'date' AS visit_date, data->>'findings' AS findings, created_at
  FROM records WHERE entity = 'visit' AND NOT deleted;
