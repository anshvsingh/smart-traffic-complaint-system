# Test Execution Results

Rules (from our STP §5.4–5.5): a case is **Pass** only if observed behaviour matches the expected result, **Fail** otherwise, **Blocked** if a prerequisite is missing, **Not Run** until executed. Nothing below is marked Pass/Fail without an actual run.

## Current status: 17 Nov 2026 (previous: 30 Oct 2026)

| Item | State |
|---|---|
| Test cases written | 47 (TC01–TC47) in `test-cases.md`; TC01–TC41 are automated in `testing/automated/` (45 Jest tests, some IDs have a/b variants) |
| Automated suite executed | **45/45 passed** on 16 Nov 2026 (Run 1 below) |
| Manual UI cases (TC42–TC47) | TC42–TC46 Pass (automated in Chrome, now with Playwright: `system/e2e/`); TC47 Firefox not run |
| System tests on the running stack | First run 102/104 (BUG-007, BUG-008 found). After fixes (Run 2): 104/104. Run 3 deployment smoke tests: Docker Compose and Kubernetes pass. **106/106** (see `TrafficCare_System_Test_Report`) |
| Defects | BUG-001 … BUG-008: all verified fixed; none open |

### Predicted outcome of the first automated run (from code review, 30 Oct; superseded by Run 1: all passed)

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

### Run 4: 17 Nov 2026, browser suite ported to Playwright

| Suite | Command | Result |
|---|---|---|
| Browser end-to-end (Playwright 1.64.1, Google Chrome) | `cd testing/system && npx playwright test` | **16/16 passed** (`system/results/ui-e2e-results.md`) |

Runs 1–2 used the earlier Puppeteer script (`ui-e2e.cjs`), which this suite replaces step for step.

### Run 3: 17 Nov 2026, deployment smoke tests (Docker Desktop 29.8.2, Kubernetes)

| Case | Command | Result |
|---|---|---|
| TC-SYS-01 Docker Compose | `docker compose up --build`; `docker compose ps`; health checks | **Pass**: 3 containers up; backend ok; DL `model_loaded: true`; web HTTP 200 |
| TC-SYS-02 Kubernetes | `kubectl get deployments,pods,services`; in-cluster and port-forward checks | **Pass**: 3 deployments 1/1, pods Running, services resolve |

Evidence: `system/results/deployment-smoke-results.md`.

### Run 2: 17 Nov 2026, regression after fixing BUG-007 and BUG-008 (commit `c4ca873`)

| Suite | Command | Result |
|---|---|---|
| QA API suite | `bash testing/run-tests.sh` | **45/45 passed** |
| Backend unit tests | `cd server && npm test` | 95/95 passed |
| Frontend unit tests | `cd client && npm test` | 37/37 passed |
| Live API system tests | `node testing/system/system-tests.mjs` | 39/39 passed |
| Browser end-to-end | `node testing/system/ui-e2e.cjs` | **16/16 passed** (UI-08b, UI-12 now pass) |
| DL outage | `node testing/system/system-tests.mjs --outage` | 2/2 passed |

### Run 1: 16–17 Nov 2026, branch `docs/update-srs-sad-stp-uml` @ `f2ff527` (application code = `main`)

| Environment | Value |
|---|---|
| OS / Node | macOS 26.5.1 (Apple Silicon) / Node 24.6.0 |
| Command | `bash testing/run-tests.sh` |
| Result | **45/45 passed** (21.4 s) |

| Test ID | Test case | Status | Actual result (first assertion message if failed) |
|---|---|---|---|
| TC01 | registers a new citizen | Pass | As expected |
| TC02 | rejects an already registered email (case-insensitive) | Pass | As expected |
| TC03 | logs in with valid credentials and the token opens a protected route | Pass | As expected |
| TC04 | creates a complaint with valid information | Pass | As expected |
| TC05 | denies access without a token | Pass | As expected |
| TC06 | a citizen is denied on every admin route | Pass | As expected |
| TC07 | rejects an incorrect password | Pass | As expected |
| TC08 | gives the same answer for an unknown email (no account enumeration) | Pass | As expected |
| TC08b | rejects missing login fields and query-operator objects | Pass | As expected |
| TC09 | rejects registration with missing or invalid fields | Pass | As expected |
| TC10 | denies access with a malformed token | Pass | As expected |
| TC11 | denies access with a token signed by a different secret | Pass | As expected |
| TC12 | denies access with an expired token | Pass | As expected |
| TC12b | denies access when the token's user no longer exists | Pass | As expected |
| TC13 | ignores a role supplied by the client (no self-promotion to admin) | Pass | As expected |
| TC14 | stores the password as a bcrypt hash and never returns it | Pass | As expected |
| TC15 | [BUG-004] rejects an email address with an invalid format | Pass | As expected |
| TC16 | [BUG-003] rejects an over-long name with a controlled 400 (not a 500) | Pass | As expected |
| TC17 | lists only the logged-in citizen's complaints, newest first | Pass | As expected |
| TC18 | retrieves an individual complaint the citizen owns | Pass | As expected |
| TC19 | rejects a complaint with missing fields and saves nothing | Pass | As expected |
| TC20 | [BUG-001] rejects a category that is not in the allowed list | Pass | As expected |
| TC20b | accepts every category offered by the citizen dashboard | Pass | As expected |
| TC21 | a new complaint gets the default status 'Submitted' | Pass | As expected |
| TC22 | a new complaint gets the default priority 'Medium' | Pass | As expected |
| TC23 | a citizen cannot read another citizen's complaint | Pass | As expected |
| TC24 | rejects an invalid complaint ID format | Pass | As expected |
| TC24b | returns 404 for a well-formed ID that does not exist | Pass | As expected |
| TC25 | [BUG-002] rejects an over-long description with a controlled 400 (not a 500) | Pass | As expected |
| TC26 | ignores status, priority and owner supplied by the citizen | Pass | As expected |
| TC27 | treats query-operator objects as invalid input | Pass | As expected |
| TC28 | an administrator can log in and receives role 'admin' | Pass | As expected |
| TC29 | retrieves all complaints with the citizen's name and email | Pass | As expected |
| TC30 | dashboard counts match the stored complaints | Pass | As expected |
| TC31 | updates a complaint's status | Pass | As expected |
| TC32 | updates a complaint's priority | Pass | As expected |
| TC33 | rejects a status outside the allowed list and keeps the old value | Pass | As expected |
| TC34 | rejects a priority outside the allowed list | Pass | As expected |
| TC35 | rejects an update with neither status nor priority | Pass | As expected |
| TC36 | handles invalid and unknown complaint IDs | Pass | As expected |
| TC37 | admin routes reject requests without a token | Pass | As expected |
| TC38 | a citizen token that CLAIMS role=admin is still denied (role comes from the database) | Pass | As expected |
| TC39 | a citizen cannot change status or priority | Pass | As expected |
| TC40 | [BUG-005] malformed JSON gets a controlled JSON 400 without a stack trace | Pass | As expected |
| TC41 | health check works and unknown routes return a JSON 404 | Pass | As expected |

Manual UI cases (executed in Chrome via `testing/system/ui-e2e.cjs`, screenshots in `system/screenshots/`):

| Test ID | Actual result | Status | Evidence |
|---|---|---|---|
| TC42 | Registered in the UI, "Registration successful! Please log in.", signed in to citizen dashboard | Pass | UI-01, UI-02, UI-04 |
| TC43 | Complaint with photo submitted; success notice with AI prediction; card shows Submitted | Pass | UI-06 |
| TC44 | Logout cleared token and user; reopening/reloading shows sign-in | Pass | UI-07 |
| TC45 | Admin changed priority and status, assigned a department; counters refreshed. Reporter shown as "Unknown" after the update (BUG-008) | Pass (with defect BUG-008) | UI-08, UI-08b, UI-10 |
| TC46 | Tampered token in localStorage + reload → returned to sign-in | Pass | UI-13 |
| TC47 | Chrome only; Firefox not tested | Not Run (Firefox) | none |

Additional system test runs (live stack): `system/results/system-api-results.md` (39/39), `system/results/ui-e2e-results.md` (14/16, BUG-007, BUG-008), `system/results/dl-outage-results.md` (2/2). Summary: `TrafficCare_System_Test_Report`.

## Regression testing after fixes

When the backend owner fixes a bug:

1. Pull the fix branch, run `bash testing/run-tests.sh` **and** `cd server && npm test`.
2. The test tagged with that bug ID must now pass, and **every test that passed before must still pass**.
3. Update the bug report's *Re-test* section and move it to *Verified*.

| Bug | Fix commit | Re-test date | Tagged test | Full suite | Result |
|---|---|---|---|---|---|
| BUG-001 | already on `main` | 16 Nov 2026 | TC20, TC20b | 45/45 QA + 93/93 backend | **Verified** |
| BUG-002 | already on `main` | 16 Nov 2026 | TC25 | 45/45 QA + 93/93 backend | **Verified** |
| BUG-003 | already on `main` | 16 Nov 2026 | TC16 | 45/45 QA + 93/93 backend | **Verified** |
| BUG-004 | already on `main` | 16 Nov 2026 | TC15 | 45/45 QA + 93/93 backend | **Verified** |
| BUG-005 | already on `main` | 16 Nov 2026 | TC40 | 45/45 QA + 93/93 backend | **Verified** |
| BUG-006 | already on `main` | 16 Nov 2026 | (full suite) | 45/45 QA + 93/93 backend | **Verified** |
| BUG-007 | `c4ca873` | 17 Nov 2026 | UI-12, DashboardTracking.test.jsx | Run 2: all suites pass | **Verified** |
| BUG-008 | `c4ca873` | 17 Nov 2026 | UI-08b, adminWorkflow.test.js | Run 2: all suites pass | **Verified** |
