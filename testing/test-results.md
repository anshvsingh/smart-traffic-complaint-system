# Test Execution Results

Rules (from our STP §5.4–5.5): a case is **Pass** only if observed behaviour matches the expected result, **Fail** otherwise, **Blocked** if a prerequisite is missing, **Not Run** until executed. Nothing below is marked Pass/Fail without an actual run.

## Current status — 30 Oct 2026

| Item | State |
|---|---|
| Test cases written | 47 (TC01–TC47) in `test-cases.md`; TC01–TC41 are automated in `testing/automated/` (45 Jest tests, some IDs have a/b variants) |
| Automated suite executed | **Not Run yet** — the sandbox used to prepare this branch has no access to the npm registry, so `server/node_modules` (Jest, Supertest, mongodb-memory-server) could not be installed there. Run it locally with `bash testing/run-tests.sh` and paste the generated table below. |
| Manual UI cases (TC42–TC47) | Not Run |
| Static code review | Done — 6 issues logged in `bug-reports/` (BUG-001 … BUG-006) |

### Predicted outcome of the first automated run (from code review — to be confirmed)

| Test ID | Prediction | Why |
|---|---|---|
| TC15 | Fail | BUG-004: no email format check |
| TC16 | Fail | BUG-003: `maxlength` error becomes 500 |
| TC20 | Fail | BUG-001: no category validation. The backend's own `server/tests/complaint.test.js` has the same check and should also fail. |
| TC25 | Fail | BUG-002: `maxlength` error becomes 500 |
| TC40 | Fail | BUG-005: no JSON error handler |
| all others | Pass | Behaviour matches the code |

## Run log

Copy each run's `testing/automated/latest-results.md` here (newest first). Record the commit you tested.

### Run 1 — _date_ — commit `_hash_` — run by _name_

| Environment | Value |
|---|---|
| OS / Node | |
| Command | `bash testing/run-tests.sh` |
| Result | _x_/45 passed |

_Paste the table from `testing/automated/latest-results.md` here._

Manual cases:

| Test ID | Actual result | Status | Evidence |
|---|---|---|---|
| TC42 | | Not Run | |
| TC43 | | Not Run | |
| TC44 | | Not Run | |
| TC45 | | Not Run | |
| TC46 | | Not Run | |
| TC47 | | Not Run | |

## Regression testing after fixes

When the backend owner fixes a bug:

1. Pull the fix branch, run `bash testing/run-tests.sh` **and** `cd server && npm test`.
2. The test tagged with that bug ID must now pass, and **every test that passed before must still pass**.
3. Update the bug report's *Re-test* section and move it to *Verified*.

| Bug | Fix commit | Re-test date | Tagged test | Full suite | Result |
|---|---|---|---|---|---|
| BUG-001 | | | TC20, TC20b | | Pending |
| BUG-002 | | | TC25 | | Pending |
| BUG-003 | | | TC16 | | Pending |
| BUG-004 | | | TC15 | | Pending |
| BUG-005 | | | TC40 | | Pending |
| BUG-006 | | | (full suite) | | Pending |
