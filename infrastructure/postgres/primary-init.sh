#!/bin/bash
# Runs once when the primary database is created.
# Creates the replication user and a replication slot so the replica can stream
# the write-ahead log (WAL) — DDIA Ch.6, leader-based replication.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${REPLICATION_PASSWORD:-replicator}';
  SELECT pg_create_physical_replication_slot('replica_1');
EOSQL
echo "host replication replicator all scram-sha-256" >> "$PGDATA/pg_hba.conf"
