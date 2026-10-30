#!/usr/bin/env bash
# Run the QA suite (testing/automated) against the backend in server/.
# Uses an in-memory MongoDB, so it never touches MongoDB Atlas or real data.
# The first run downloads a MongoDB binary (needs internet), exactly like `npm test` in server/.
#
#   bash testing/run-tests.sh
#
# Writes: testing/automated/last-run.json and testing/automated/latest-results.md

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"

if [ ! -d node_modules ]; then
  echo "Installing backend dependencies (npm install in server/)..."
  npm install
fi

NODE_OPTIONS=--experimental-vm-modules npx jest \
  -c ../testing/automated/jest.config.js \
  --runInBand \
  --json --outputFile=../testing/automated/last-run.json
STATUS=$?

node ../testing/automated/report.js ../testing/automated/last-run.json > ../testing/automated/latest-results.md
echo
echo "Results table written to testing/automated/latest-results.md"
echo "Tests tagged [BUG-xxx] are expected to fail until the matching bug is fixed."
exit $STATUS
