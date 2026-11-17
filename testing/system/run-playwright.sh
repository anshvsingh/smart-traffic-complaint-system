#!/usr/bin/env bash
# Run the TrafficCare Playwright browser tests with one command (macOS / Linux).
#
#   bash testing/system/run-playwright.sh            # headless
#   bash testing/system/run-playwright.sh --headed   # watch the browser
#
# What it does:
#   1. starts a throwaway MongoDB test database in Docker (your real database is never used)
#   2. starts the AI service, backend and web client with test settings
#      (passed only to these processes; server/.env is NOT edited)
#   3. creates a test administrator
#   4. runs the 16 Playwright tests and saves screenshots + an HTML report
#   5. stops everything and removes the test database
#
# Needs: Docker Desktop running, Node.js, Python 3 with dl/requirements.txt installed,
# dl/models/best_model.pth (dvc pull), server/.env with JWT_SECRET and DEPT_*_PASSWORD.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="$ROOT/testing/system/test-results/logs"
mkdir -p "$LOGS"
DB_CONTAINER="trafficcare-playwright-db"
DB_PORT=27018
PIDS=()

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31mERROR: %s\033[0m\n" "$*"; exit 1; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

cleanup() {
  say "Stopping the app and removing the test database"
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && pkill -P "$pid" 2>/dev/null; kill "$pid" 2>/dev/null
  done
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

wait_for() {  # url, name, seconds
  local url=$1 name=$2 secs=${3:-90}
  for _ in $(seq "$secs"); do
    curl -s -o /dev/null -m 2 "$url" && { echo "   $name is up"; return 0; }
    sleep 1
  done
  fail "$name did not start in ${secs}s - see $LOGS"
}

# ---------------------------------------------------------------- checks
say "Checking prerequisites"
docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker Desktop and try again."
[ -f "$ROOT/server/.env" ] || fail "server/.env is missing."
[ -f "$ROOT/dl/models/best_model.pth" ] || fail "dl/models/best_model.pth is missing. Run: dvc pull"
for port in 5050 5173; do
  port_busy $port && fail "Port $port is in use. Stop the app first (docker compose down, or Ctrl+C in its terminal)."
done
DL_PORT=8000
port_busy $DL_PORT && DL_PORT=8010 && echo "   port 8000 is busy, using $DL_PORT for the AI service"
port_busy $DB_PORT && fail "Port $DB_PORT is in use."

# ---------------------------------------------------------------- test settings
TEST_ADMIN_PASSWORD="Test-$(openssl rand -hex 8)"
export MONGODB_URI="mongodb://127.0.0.1:$DB_PORT/trafficcare_playwright"
export DL_API_URL="http://127.0.0.1:$DL_PORT/predict"
export DL_URL="http://127.0.0.1:$DL_PORT"
export PORT=5050
export SYSTEM_TEST_ADMIN_EMAIL="admin.playwright@trafficcare.test"
export SYSTEM_TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD"

# ---------------------------------------------------------------- dependencies
[ -d "$ROOT/server/node_modules" ] || (say "Installing backend packages" && cd "$ROOT/server" && npm install --no-audit --no-fund)
[ -d "$ROOT/client/node_modules" ] || (say "Installing frontend packages" && cd "$ROOT/client" && npm install --no-audit --no-fund)
[ -d "$ROOT/testing/system/node_modules" ] || (say "Installing Playwright" && cd "$ROOT/testing/system" && npm install --no-audit --no-fund)

# ---------------------------------------------------------------- start everything
say "Starting test database (Docker, port $DB_PORT)"
docker rm -f "$DB_CONTAINER" >/dev/null 2>&1
docker run -d --name "$DB_CONTAINER" -p "$DB_PORT:27017" mongo:7 >/dev/null || fail "Could not start MongoDB in Docker."

say "Starting AI service (port $DL_PORT)"
(cd "$ROOT/dl" && exec python3 -m uvicorn src.api:app --host 127.0.0.1 --port "$DL_PORT") >"$LOGS/dl.log" 2>&1 &
PIDS+=($!)

say "Starting backend (port 5050)"
for _ in $(seq 30); do docker exec "$DB_CONTAINER" mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1 && break; sleep 1; done
(cd "$ROOT/server" && exec node index.js) >"$LOGS/backend.log" 2>&1 &
PIDS+=($!)

say "Starting web client (port 5173)"
(cd "$ROOT/client" && exec npx vite --host 127.0.0.1 --port 5173 --strictPort) >"$LOGS/frontend.log" 2>&1 &
PIDS+=($!)

wait_for "http://127.0.0.1:$DL_PORT/health" "AI service" 120
wait_for "http://127.0.0.1:5050/api/health" "Backend" 60
wait_for "http://127.0.0.1:5173" "Web client" 60

say "Creating test administrator"
(cd "$ROOT" && node testing/system/create-admin.js) || fail "Could not create the test administrator."

# ---------------------------------------------------------------- run tests
say "Running Playwright tests"
cd "$ROOT/testing/system"
npx playwright test "$@"
STATUS=$?

say "Done (exit code $STATUS)"
echo "   Screenshots: testing/system/screenshots/"
echo "   Results:     testing/system/results/ui-e2e-results.md"
echo "   HTML report: cd testing/system && npx playwright show-report"
exit $STATUS
