-- Real administrative areas of Nepal.
--
-- Wards are now real wards with codes like P3-D35-L386-W01 (province, district,
-- local level, ward; see shared/areas.js), so there are 6,743 possible wards.
-- Health records are therefore partitioned by PROVINCE (range of ward codes)
-- instead of one partition per ward. The demo wards "ward-1..3" of earlier
-- versions become wards 1-3 of Indrawati Rural Municipality, Sindhupalchok.

CREATE TEMP TABLE ward_map (old TEXT PRIMARY KEY, new TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO ward_map VALUES
  ('ward-1', 'P3-D35-L386-W01'),
  ('ward-2', 'P3-D35-L386-W02'),
  ('ward-3', 'P3-D35-L386-W03');

-- 1. Move the old table (and its partitions) out of the way.
DROP VIEW IF EXISTS patients_v, pregnancies_v, visits_v;
ALTER TABLE records RENAME TO records_old;
ALTER TABLE IF EXISTS records_ward_1 RENAME TO records_old_ward_1;
ALTER TABLE IF EXISTS records_ward_2 RENAME TO records_old_ward_2;
ALTER TABLE IF EXISTS records_ward_3 RENAME TO records_old_ward_3;
ALTER TABLE IF EXISTS records_other RENAME TO records_old_other;
ALTER INDEX IF EXISTS records_id_idx RENAME TO records_old_id_idx;
ALTER INDEX IF EXISTS records_seq_idx RENAME TO records_old_seq_idx;
ALTER INDEX IF EXISTS records_entity_idx RENAME TO records_old_entity_idx;
ALTER INDEX IF EXISTS records_patient_idx RENAME TO records_old_patient_idx;

-- 2. New table, partitioned by province. Ward codes start with "P<n>-", and the
--    "C" collation makes the range bounds plain byte order ("-" < ".").
CREATE TABLE records (
  id             UUID NOT NULL,
  ward           TEXT COLLATE "C" NOT NULL,
  entity         TEXT NOT NULL CHECK (entity IN ('patient', 'pregnancy', 'visit')),
  data           JSONB NOT NULL DEFAULT '{}',
  field_meta     JSONB NOT NULL DEFAULT '{}',
  vv             JSONB NOT NULL DEFAULT '{}',
  version        INT NOT NULL DEFAULT 0,
  deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  open_conflicts INT NOT NULL DEFAULT 0,
  server_seq     BIGINT NOT NULL,
  created_by     INT,
  updated_by     INT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ward, id)
) PARTITION BY RANGE (ward);

CREATE TABLE records_koshi         PARTITION OF records FOR VALUES FROM ('P1-') TO ('P1.');
CREATE TABLE records_madhesh       PARTITION OF records FOR VALUES FROM ('P2-') TO ('P2.');
CREATE TABLE records_bagmati       PARTITION OF records FOR VALUES FROM ('P3-') TO ('P3.');
CREATE TABLE records_gandaki       PARTITION OF records FOR VALUES FROM ('P4-') TO ('P4.');
CREATE TABLE records_lumbini       PARTITION OF records FOR VALUES FROM ('P5-') TO ('P5.');
CREATE TABLE records_karnali       PARTITION OF records FOR VALUES FROM ('P6-') TO ('P6.');
CREATE TABLE records_sudurpashchim PARTITION OF records FOR VALUES FROM ('P7-') TO ('P7.');
CREATE TABLE records_other         PARTITION OF records DEFAULT;

-- 3. Copy every record with its new ward. A new change number makes every phone
--    pull the record again (and so learn its new ward code).
INSERT INTO records (id, ward, entity, data, field_meta, vv, version, deleted, open_conflicts,
                     server_seq, created_by, updated_by, created_at, updated_at)
SELECT r.id, COALESCE(m.new, r.ward), r.entity, r.data, r.field_meta, r.vv, r.version, r.deleted, r.open_conflicts,
       nextval('record_seq'), r.created_by, r.updated_by, r.created_at, r.updated_at
FROM records_old r LEFT JOIN ward_map m ON m.old = r.ward;

DROP TABLE records_old CASCADE;

CREATE INDEX records_id_idx      ON records (id);
CREATE INDEX records_seq_idx     ON records (server_seq);
CREATE INDEX records_entity_idx  ON records (entity);
CREATE INDEX records_patient_idx ON records ((data->>'patientId'));

-- 4. Every other table that stores a ward.
UPDATE sync_events       t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE conflicts         t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE attachments       t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE an_daily_visits   t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE an_village_stats  t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE an_monthly_registrations t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE an_followup       t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;
UPDATE an_stream_counts  t SET ward = m.new FROM ward_map m WHERE t.ward = m.old;

-- 5. User areas: doctors and admins cover all of Nepal; workers and patients keep their ward.
UPDATE users SET wards = ARRAY['NP'] WHERE role IN ('admin', 'supervisor');
UPDATE users u SET wards = (
  SELECT array_agg(COALESCE(m.new, w)) FROM unnest(u.wards) w LEFT JOIN ward_map m ON m.old = w
) WHERE role IN ('worker', 'patient') AND cardinality(wards) > 0;

-- 6. Readable views, with the province / district / local level parts of the ward code.
CREATE VIEW patients_v AS
  SELECT id, ward, split_part(ward, '-', 1) AS province_code, data->>'name' AS name, (data->>'age')::int AS age,
         data->>'sex' AS sex, data->>'village' AS village, data->>'phone' AS phone, open_conflicts, version, created_at, updated_at
  FROM records WHERE entity = 'patient' AND NOT deleted;

CREATE VIEW pregnancies_v AS
  SELECT id, ward, data->>'patientId' AS patient_id, data->>'lmp' AS lmp, data->>'edd' AS edd,
         data->>'riskLevel' AS risk_level, data->>'status' AS status, open_conflicts, updated_at
  FROM records WHERE entity = 'pregnancy' AND NOT deleted;

CREATE VIEW visits_v AS
  SELECT id, ward, data->>'patientId' AS patient_id, data->>'type' AS visit_type,
         data->>'date' AS visit_date, data->>'findings' AS findings, created_at
  FROM records WHERE entity = 'visit' AND NOT deleted;
