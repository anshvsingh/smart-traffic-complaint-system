# Software Test Plan

## TrafficCare — Smart Traffic Complaint and Monitoring System

**Version:** 1.0 · **Date:** 14 November 2026 · **Test status:** Not executed by this document

## 1. Purpose

Define the scope, approach, environment, cases, and exit criteria for verifying the current TrafficCare implementation. A test is only Pass or Fail after execution and observation. Static code inspection or a predicted outcome is not execution evidence.

## 2. Scope

**In scope:** registration/login, JWT and role boundaries, complaint validation and ownership, image upload and AI integration outcomes, administrator actions, department workflow, persistence, API errors, client role dashboards, and service health.

**Out of scope:** model accuracy certification, penetration testing, public-cloud availability, load certification, email/SMS, production backup/restore, and features not implemented (e.g. server-side filtering/pagination and token revocation).

## 3. Test approach and artifacts

| Level | Method / tools | Evidence |
|---|---|---|
| API unit/integration | Jest, Supertest, mongodb-memory-server; `server/tests` and `testing/automated` | Test output, commit, runtime versions |
| Frontend | Vitest, React Testing Library | Test output and browser observations |
| DL API | Python unittest; `dl/tests/test_api.py` | Test output; note whether model is mocked or real |
| System/manual | React UI and API client against running stack | Case ID, steps, observed result, screenshot/log if useful |
| Deployment smoke | Docker Compose or Kubernetes health and role workflows | Pod/service state and endpoint responses |

Do not infer model quality from API contract tests. If the inference test mocks the model, label it as contract/path verification only.

## 4. Environment and data

- Supported local stack: Node.js/npm, Python dependencies in `dl/requirements.txt`, MongoDB (test DB or in-memory test server), and browser.
- Configure `JWT_SECRET`, Mongo connection string, `DL_API_URL` when testing image integration, and a compatible model checkpoint for real inference.
- Use synthetic test accounts for citizen, admin, and at least two departments; use non-production complaint data and images.
- For manual UI tests, run backend at `localhost:5050`, frontend at `localhost:5173`, and DL API at `localhost:8000` when image analysis is included.

## 5. Test cases

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| STP-01 | Register with valid details; attempt duplicate case-variant email | First request 201 with citizen role and no password; duplicate 409 | High |
| STP-02 | Register missing/invalid email, blank name, short password, excessive name | Controlled 400; no account created | High |
| STP-03 | Login valid credentials, then wrong password and unknown email | 200 with expiring JWT for valid login; both invalid cases 401 with same message | High |
| STP-04 | Protected endpoint with missing, malformed, expired, or wrong-secret JWT | 401; no protected data returned | High |
| STP-05 | Register request includes role=admin | Account remains citizen | Critical |
| STP-06 | Citizen submits valid complaint with each allowed category | 201; owner and default state/priority are correct | High |
| STP-07 | Submit missing/blank/invalid category, excessive description/location | Controlled 400; no complaint persisted | High |
| STP-08 | Citizen lists and opens own complaint; attempts another user's ID | Own data 200; other user's record is 404 | Critical |
| STP-09 | Upload JPG/PNG under 10 MB with DL service available | Image stored; complaint created; prediction fields recorded when response is valid | High |
| STP-10 | Upload unsupported/empty/corrupt/over-10-MB image or DL times out | Invalid uploads rejected; DL failure is recorded and complaint still created for an otherwise valid report | High |
| STP-11 | Citizen calls admin/department endpoints; forged JWT role claim | 403 for wrong role; server-loaded role controls authorization | Critical |
| STP-12 | Admin lists complaints and dashboard aggregates | All complaint rows and correct status counts; no password data | High |
| STP-13 | Admin creates department with valid/duplicate/short-password input | 201 then appropriate 409/400; role is department | High |
| STP-14 | Admin assigns and reassigns complaint to valid/nonexistent department | Valid assignment updates states and appends history; nonexistent department rejected | High |
| STP-15 | Admin updates valid/invalid status and priority; empty update | Valid values persist; invalid/empty values return 400 with previous values preserved | High |
| STP-16 | Department lists, accepts, posts progress, completes own assigned complaint | Correct workflow transitions and audit entries; invalid transition rejected | High |
| STP-17 | Department attempts to read/update another department's complaint | 404; record unchanged | Critical |
| STP-18 | Malformed JSON, unknown URL, API health | JSON 400, JSON 404, and 200 healthy response respectively | Medium |
| STP-19 | UI registration → login → citizen complaint → logout; repeat with admin and department | Correct dashboard per role, visible persisted state, logout clears client session | High |
| STP-20 | Compose/Kubernetes smoke test | Services become ready; frontend reaches API; backend reaches DB and DL where configured | Medium |

## 6. Execution and defect handling

Record for each run: date/time, tester, commit, environment, command or steps, expected result, actual result, status (`Pass`, `Fail`, `Blocked`, `Not Run`), and linked defect. Mark `Blocked` only when a prerequisite prevents execution. Retest fixed defects and run relevant regression cases. Never fill actual-result fields from source-code prediction.

Repository test inventory currently includes backend Jest tests, client Vitest tests, DL unittest tests, a detailed API case matrix in `testing/test-cases.md`, and defect reports in `testing/bug-reports/`. Consult those files for exact command lines and existing run records. This plan does not claim a new test run.

## 7. Entry and exit criteria

**Entry:** target build/commit selected; test database and required secrets configured; services and test dependencies available; synthetic accounts/data prepared.

**Exit:** all Critical/High cases executed; no open Critical defects; failures linked to defects; blocked/not-run cases and environmental limits documented; regression evidence recorded. Release acceptance requires the project owner to review unresolved defects and test evidence.

## 8. Risks

External MongoDB availability and DL checkpoint presence affect system tests. Real image inference can be slow and confidence is not correctness. Full-list endpoints may become slow with large data volumes. Browser-local JWT storage means client logout does not invalidate a token already copied elsewhere; the token remains valid until expiry.
