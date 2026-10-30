# Testing — Smart Traffic Complaint and Monitoring System

Owner: Avyukt (QA). Backend code is **not modified** here; defects are reported to the backend owner.

| File | What it is |
|---|---|
| [`test-cases.md`](test-cases.md) | All test cases (TC01–TC47): steps, expected result, actual result, status, link to STP case and bug report |
| [`test-results.md`](test-results.md) | Execution log per run + regression table after fixes |
| [`bug-reports/`](bug-reports/) | One file per defect (BUG-001 … BUG-006) |
| [`automated/`](automated/) | Jest + Supertest suite for TC01–TC41, uses an in-memory MongoDB (never touches Atlas) |
| [`run-tests.sh`](run-tests.sh) | Runs the suite with the backend's own `node_modules` and writes `automated/latest-results.md` |

## Run

```bash
bash testing/run-tests.sh        # installs server deps on first run, then runs testing/automated
cd server && npm test            # the backend's own tests (regression)
```

Tests named `TCxx [BUG-00y] …` describe the **correct** behaviour and are expected to fail until that bug is fixed.
