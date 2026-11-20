#!/bin/bash
# Starts a hot-standby replica. On first start it copies the primary with
# pg_basebackup (-R writes standby.signal + connection settings), then follows
# the primary's WAL stream continuously. Read-only queries are allowed.
set -e
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] cloning ${PRIMARY_HOST} with pg_basebackup"
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  until PGPASSWORD="$REPLICATION_PASSWORD" gosu postgres pg_basebackup \
      -h "$PRIMARY_HOST" -p 5432 -U replicator -D "$PGDATA" -X stream -R -S replica_1 -P; do
    echo "[replica] primary not ready yet, retrying in 3s"
    rm -rf "${PGDATA:?}"/*
    sleep 3
  done
fi
exec docker-entrypoint.sh postgres -c hot_standby=on
