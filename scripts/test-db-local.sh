#!/usr/bin/env bash
# Runs migrations + pgTAP tests against a throwaway local Postgres, without
# Docker or the Supabase CLI. Requires: initdb/pg_ctl/psql (Postgres 15+),
# pgTAP installed, and pg_prove (optional; falls back to psql).
#
#   scripts/test-db-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
DATA_DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA_DIR"
  RUN_AS=(runuser -u postgres --)
fi

cleanup() {
  "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA_DIR" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -k /tmp" -l "$DATA_DIR/log" start -w >/dev/null

export PGHOST=/tmp PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -f "$ROOT/supabase/tests/local/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

# pgTAP lives in the extensions schema, as on Supabase.
"${PSQL[@]}" -c "alter database postgres set search_path = public, extensions"

if command -v pg_prove >/dev/null 2>&1; then
  pg_prove --ext .sql "$ROOT"/supabase/tests/database/
else
  fail=0
  for t in "$ROOT"/supabase/tests/database/*.sql; do
    out="$("${PSQL[@]}" -t -A -f "$t" 2>&1)" || fail=1
    echo "$out" | grep -E '^(not )?ok|^#' || true
    if echo "$out" | grep -qE '^not ok|ERROR'; then fail=1; echo "FAILED: $t"; echo "$out" | grep ERROR || true; fi
  done
  exit $fail
fi
