#!/usr/bin/env bash
# Starts/stops a project-local PostgreSQL cluster (port 5433) for development.
# Use this if you don't have Docker and don't want to touch a system Postgres.
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}" LANG="${LANG:-en_US.UTF-8}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/.local/pgdata"
PORT="${PGPORT_LOCAL:-5433}"
case "${1:-start}" in
  start)
    if [ ! -d "$DIR" ]; then
      mkdir -p "$(dirname "$DIR")"
      initdb -D "$DIR" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
    fi
    pg_ctl -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=localhost" -l "$DIR/../pg.log" start
    sleep 2
    for db in constituencyos constituencyos_test; do
      psql -h localhost -p "$PORT" -U postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 \
        || psql -h localhost -p "$PORT" -U postgres -c "create database $db" >/dev/null
    done
    echo "Postgres running on localhost:$PORT (databases: constituencyos, constituencyos_test)"
    ;;
  stop) pg_ctl -D "$DIR" stop ;;
  status) pg_ctl -D "$DIR" status ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac
