# TrafficCare system tests

System tests run against the **whole running system**: web client, backend, deep-learning service and a **test** MongoDB. Results are summarised in `TrafficCare_System_Test_Report` (repository root).

| Suite | What it covers | Command (from this folder) |
|---|---|---|
| Live API tests | 39 end-to-end API scenarios incl. the real DL service | `npm run test:api` |
| Browser end-to-end (**Playwright**) | 16 UI steps: register → complaint with photo → admin assigns → department completes → admin resolves → citizen sees history; session, mobile, keyboard | `npm run test:e2e` |
| DL outage | Complaint still accepted while the DL service is stopped | stop the DL service, then `npm run test:outage` |

## 1. One-time setup

```bash
cd testing/system
npm install            # installs @playwright/test
```

The Playwright tests use your installed Google Chrome. To use Playwright's own browser instead: `npx playwright install chromium` and run with `PW_CHANNEL= npx playwright test`.

## 2. Start the stack against a TEST database

`server/.env` (never committed) needs a **test** database and test passwords, for example:

```
MONGODB_URI=mongodb://127.0.0.1:27017/trafficcare_systemtest
JWT_SECRET=<random string>
DL_API_URL=http://127.0.0.1:8000/predict
DEPT_ROADS_PASSWORD=...   DEPT_POLICE_PASSWORD=...   DEPT_ELECTRICAL_PASSWORD=...
DEPT_TRANSPORT_PASSWORD=...   DEPT_SIGNALS_PASSWORD=...
SYSTEM_TEST_ADMIN_EMAIL=admin.systemtest@trafficcare.test
SYSTEM_TEST_ADMIN_PASSWORD=...
```

Then start MongoDB, `cd server && npm start`, `cd dl && uvicorn src.api:app --port 8000`, `cd client && npm run dev`, and create the admin account:

```bash
node create-admin.js
```

## 3. Run

```bash
npm run test:api
npm run test:e2e
npm run report         # opens the Playwright HTML report
```

Outputs: `results/*.md|json` (committed), `screenshots/*.png` (one per browser step), `playwright-report/` (HTML, not committed).
