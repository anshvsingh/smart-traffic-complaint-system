# Software Test Plan

## TrafficCare: Smart Traffic Complaint and Monitoring System

| Item | Value |
|---|---|
| Document | Software Test Plan (STP) |
| Version | 2.0 |
| Date | 16 November 2026 |
| Status | Plan baselined; execution records are kept in `testing/test-results.md` |
| Standard followed | IEEE 829-2008 / ISO/IEC/IEEE 29119-3 test plan structure |
| Related documents | TrafficCare_SRS, TrafficCare_SAD, TrafficCare_UML, `testing/test-cases.md`, `testing/bug-reports/` |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | 14 Nov 2026 | First implementation-aligned test plan |
| 2.0 | 16 Nov 2026 | Restructured to IEEE 829. Added test items, features not tested, pass/fail and suspension criteria, detailed cases with requirement traceability, DL/ML/QML model evaluation tests, CI, schedule, roles, and latest reported results |

---

## 1. Introduction

### 1.1 Purpose

This plan defines how TrafficCare is verified against the SRS: what is tested, how, in which environment, by whom, and when testing is complete.

### 1.2 Rule on evidence

A case is **Pass** only when the observed behaviour matches the expected result in a recorded run, **Fail** when it does not, **Blocked** when a prerequisite is missing, and **Not Run** otherwise. Code reading or prediction is never recorded as a result.

### 1.3 References

TrafficCare_SRS v2.0 (requirement IDs), TrafficCare_SAD v2.0 (interfaces), `testing/test-cases.md` (47 detailed API cases TC01–TC47), `testing/bug-reports/` (BUG-001 … BUG-006), `dl/docs/02_model_comparison.md`, `qml/docs/05_results_and_discussion.md`.

---

## 2. Test Items

| Item | Version / location |
|---|---|
| Web client | `client/` (React 19, Vite 8) |
| Backend API | `server/` (Express 5, Mongoose 9) |
| DL inference service | `dl/src/api.py` with `best_model.pth` |
| Research models | `dl/src/compare_models.py`, `qml/src/*.py` |
| Deployment | `docker-compose.yml`, `k8s/*.yaml`, Dockerfiles |
| CI workflows | `.github/workflows/main.yml`, `ci.yml` |

## 3. Features to Be Tested

Authentication and authorisation; citizen complaint submission, validation and ownership; image upload; AI integration and fallback; DL service validation and prediction; admin listing, department creation, assignment, status/priority updates and statistics; department accept/progress/completion and scoping; error handling; client role routing and session; model evaluation of ML, DL and QML algorithms; container and Kubernetes smoke tests.

## 4. Features Not to Be Tested

| Feature | Reason |
|---|---|
| Geolocation, maps, notifications, pagination, token revocation | Not implemented (SRS §2.7) |
| Penetration testing and load certification | Outside project resources; basic security cases only |
| Public-cloud availability | Deployment is a local cluster |
| Real quantum hardware | Only simulators are available |
| Real-world accuracy certification of the classifier | No labelled field data; offline test sets only |

---

## 5. Approach

### 5.1 Test levels

| Level | Scope | Tools | Location |
|---|---|---|---|
| Unit | Middleware, model rules, React components | Jest, Vitest, React Testing Library | `server/tests`, `client/src/test` |
| API integration | Routes + real Mongoose against in-memory MongoDB | Jest, Supertest, mongodb-memory-server | `server/tests`, `testing/automated` |
| DL service | FastAPI endpoints with a mocked model | Python unittest / pytest, FastAPI TestClient | `dl/tests/test_api.py` |
| Model evaluation | Accuracy/F1 of ML, DL and QML models on held-out data | scikit-learn metrics, McNemar test | `dl/results`, `qml/results` |
| System / manual | End-to-end flows in the browser on the running stack | Chrome, Postman / Thunder Client | Section 7.9 |
| Deployment smoke | Containers and pods start and talk to each other | Docker Compose, kubectl | Section 7.10 |
| Static analysis | Python lint, JS lint, build | Pylint, ESLint, `vite build` | CI |

### 5.2 Techniques

- **Equivalence partitioning and boundary values** for lengths (name 100/101, password 7/8, location 200/201, description 2000/2001, progress 1000/1001) and file size (10 MB / 10 MB + 1 byte).
- **State-transition testing** for complaint and department status (see UML state diagrams).
- **Negative and security testing** for missing/forged tokens, wrong roles, NoSQL operator payloads, other users' IDs.
- **Fault injection** for the DL dependency (service stopped, timeout, invalid JSON).
- **Regression**: the full automated suite runs in CI on every push and pull request to `main`.

### 5.3 Test data

Synthetic accounts only: two citizens, one admin, and department accounts for at least two departments. Images: valid JPEG and PNG, a GIF, a 0-byte file, a corrupted file, and a > 10 MB file. Model evaluation uses the fixed 300-patch CPRD test set and the "unseen highway" split.

---

## 6. Pass/Fail, Suspension and Resumption Criteria

### 6.1 Item pass/fail

- A test case passes when every expected result in its row is observed.
- A build passes when all **Critical** and **High** cases pass, there are no open Critical defects, and CI is green.
- A model passes evaluation when its metrics are reproducible from the committed scripts and the production model meets NFR-ML-01 (macro-F1 ≥ 0.80 on the shared test set).

### 6.2 Suspension

Testing is suspended when the backend cannot start (MongoDB or secrets missing), when more than 20 % of cases in a run are Blocked, or when a Critical security defect is found.

### 6.3 Resumption

Resume after the blocking issue is fixed; re-run the affected cases and the full automated regression suite.

---

## 7. Test Cases

Priority: **C** Critical, **H** High, **M** Medium, **L** Low. Type: **A** automated, **M** manual.

### 7.1 Authentication (TC-AUTH)

| ID | Req. | Scenario / input | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-AUTH-01 | FR-AUTH-01 | Register with valid name, e-mail, 8-char password | 201; role `citizen`; no password in body | H | A |
| TC-AUTH-02 | FR-AUTH-03 | Register `dup@example.com`, then `DUP@Example.com` | Second request 409; one user stored | H | A |
| TC-AUTH-03 | FR-AUTH-01 | Missing name/e-mail/password; blank name; 7-char password | 400 each; no user created | H | A |
| TC-AUTH-04 | FR-AUTH-01 | E-mail `not-an-email` | 400 | M | A |
| TC-AUTH-05 | FR-AUTH-01 | Name of 101 characters (boundary 100 passes) | 101 → 400 "Name must be 100 characters or fewer"; 100 → 201 | M | A |
| TC-AUTH-06 | FR-AUTH-02 | Register with `"role":"admin"` | 201; stored role `citizen` | C | A |
| TC-AUTH-07 | FR-AUTH-04 | Login with valid credentials; call `GET /api/complaints` with token | 200 with JWT (`exp` = `iat` + 3600); protected call 200 | H | A |
| TC-AUTH-08 | FR-AUTH-05 | Wrong password; unknown e-mail | 401 with identical message for both | H | A |
| TC-AUTH-09 | NFR-SEC-03 | Login body `{"email":{"$gt":""},"password":"x"}` and `{}` | 400; no token | C | A |
| TC-AUTH-10 | NFR-SEC-01 | Inspect stored user after registration | Password starts with `$2` (bcrypt) and is not returned by any API | H | A |
| TC-AUTH-11 | FR-AUTH-09 | Start server with empty DB and all `DEPT_*_PASSWORD` set; restart | 5 department users created once; no duplicates on restart | M | M |

### 7.2 Security and access control (TC-SEC)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-SEC-01 | FR-AUTH-06 | Protected route with no header, `Bearer` only, or non-Bearer scheme | 401 | C | A |
| TC-SEC-02 | FR-AUTH-06 | Expired token; token signed with a different secret | 401 "Invalid or expired authentication" | C | A |
| TC-SEC-03 | FR-AUTH-06 | Valid token for a user that was deleted | 401 | H | A |
| TC-SEC-04 | FR-AUTH-07 | Citizen token on `/api/admin/*` and `/api/department/*` | 403 | C | A |
| TC-SEC-05 | FR-AUTH-07 | Token whose `role` claim is forged to `admin` for a citizen account | 403 (role taken from DB) | C | A |
| TC-SEC-06 | NFR-SEC-05 | Malformed JSON body | 400 JSON "Malformed JSON in request body"; no stack trace | H | A |
| TC-SEC-07 | NFR-SEC-05 | Unknown URL | 404 JSON "Route not found" | M | A |
| TC-SEC-08 | NFR-SEC-04 | Upload PNG named `evil.html`; fetch from `/uploads` | Stored as `<uuid>.png`; header `X-Content-Type-Options: nosniff` | H | A |

### 7.3 Citizen complaints (TC-CMP)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-CMP-01 | FR-CMP-01, 04 | Valid complaint without image | 201; owner = user; `Submitted`, `Medium`, `Not Assigned`, AI `Not Requested` | H | A |
| TC-CMP-02 | FR-CMP-02 | Each of the 11 categories | 201 for each | H | A |
| TC-CMP-03 | FR-CMP-02 | Category `Flying Cars` | 400 "Invalid complaint category" | H | A |
| TC-CMP-04 | FR-CMP-01 | Missing or whitespace-only category/description/location | 400; nothing stored | H | A |
| TC-CMP-05 | FR-CMP-03 | Description 2,001 chars; location 201 chars (2,000 / 200 pass) | 400 with field message | M | A |
| TC-CMP-06 | FR-CMP-05, 06 | JPEG and PNG under 10 MB | 201; `imageUrl` `/uploads/<uuid>.jpg|png`; file exists | H | A |
| TC-CMP-07 | FR-CMP-05 | GIF; file of 10 MB + 1 byte; two files | 400 with message; no file kept | H | A |
| TC-CMP-08 | FR-CMP-07 | Valid image with invalid category | 400; uploaded file deleted | M | A |
| TC-CMP-09 | FR-CMP-08 | Two citizens each create complaints; each lists | Each sees only own, newest first | C | A |
| TC-CMP-10 | FR-CMP-09 | Citizen A opens citizen B's complaint ID | 404 | C | A |
| TC-CMP-11 | FR-CMP-09 | Malformed ID `abc` | 400 "Invalid complaint ID" | M | A |

### 7.4 AI integration (TC-AI)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-AI-01 | FR-AI-01, 02 | DL service up; submit with image | AI status `Completed` with category, confidence (0–1), probabilities | H | A/M |
| TC-AI-02 | FR-AI-03 | DL service stopped | 201; AI status `Failed` | C | A |
| TC-AI-03 | FR-AI-03 | DL returns 500, or `{success:false}`, or does not reply in 30 s | 201; AI status `Failed`; request finishes ≈ 30 s for timeout | H | A |

### 7.5 DL inference service (TC-DL)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-DL-01 | FR-AI-04 | `GET /health` | 200; `model_loaded: true` | H | A |
| TC-DL-02 | FR-AI-05 | Upload `text/plain` | 400 | H | A |
| TC-DL-03 | FR-AI-05 | Empty image | 400 | H | A |
| TC-DL-04 | FR-AI-05 | Image > 10 MB | 413 | H | A |
| TC-DL-05 | FR-AI-05 | Corrupted JPEG bytes | 400 | H | A |
| TC-DL-06 | FR-AI-04 | Valid image (mocked model) | 200; one of 3 classes; probabilities sum ≈ 1 | H | A |

### 7.6 Administration (TC-ADM)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-ADM-01 | FR-ADM-01 | Admin lists complaints | 200; all complaints; reporter name/e-mail; no passwords | H | A |
| TC-ADM-02 | FR-ADM-02 | Create department with valid data | 201; role `department` | H | A |
| TC-ADM-03 | FR-ADM-02 | Missing field; 7-char password; duplicate e-mail | 400, 400, 409 | H | A |
| TC-ADM-04 | FR-ADM-03 | Assign complaint to existing department | 200; `Assigned` / `Assigned to Department`; one new progress entry | H | A |
| TC-ADM-05 | FR-ADM-03 | Reassign to another department | 200; progress message names previous department; status `Assigned` | H | A |
| TC-ADM-06 | FR-ADM-03 | Assign to department without account; missing department; bad ID | 404, 400, 400 | H | A |
| TC-ADM-07 | FR-ADM-05 | Update status `Under Review`, priority `High` | 200; both stored; progress entry added | H | A |
| TC-ADM-08 | FR-ADM-05 | Empty body; status `Done`; priority `Urgent` | 400 each; record unchanged | H | A |
| TC-ADM-09 | FR-ADM-06 | Set `Resolved` after department reports completion | 200; `Resolved`; department status `Work Completed` | H | A |
| TC-ADM-10 | FR-ADM-07 | Dashboard after creating complaints in 3 statuses | `total` correct; `byStatus` counts correct | H | A |

### 7.7 Department workflow (TC-DEP)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-DEP-01 | FR-DEP-01 | Department lists complaints | Only its department's complaints, latest update first | C | A |
| TC-DEP-02 | FR-DEP-02 | Accept an `Assigned` complaint | 200; `Accepted` / `Accepted by Department`; progress entry | H | A |
| TC-DEP-03 | FR-DEP-02 | Accept the same complaint again | 400 "cannot be accepted in its current state" | H | A |
| TC-DEP-04 | FR-DEP-03 | Post progress before accepting | 400 "Accept the complaint before posting progress" | H | A |
| TC-DEP-05 | FR-DEP-03 | Post progress (no status), then with `Work Completed` | `Work in Progress`, then `Work Completed`; two entries | H | A |
| TC-DEP-06 | FR-DEP-03 | Empty message; 1,001 chars; status `Resolved` | 400 each | H | A |
| TC-DEP-07 | FR-DEP-04 | Department B reads/accepts/updates Department A's complaint | 404; record unchanged | C | A |
| TC-DEP-08 | FR-DEP-05 | Department attempts `PATCH /api/admin/complaints/:id` with `Resolved` | 403 | C | A |

### 7.8 Model evaluation: ML, DL and QML (TC-ML)

| ID | Req. | Procedure | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-ML-01 | FR-RES-01, 06 | Check that train and test road-stretch groups do not overlap | Intersection is empty; 900 train / 300 test patches | C | A |
| TC-ML-02 | FR-RES-03 | `python qml/src/classical_model.py` | Metrics JSON for LR, SVM, RF (16 and 8 features) reproduced | H | A |
| TC-ML-03 | FR-RES-04 | `python dl/src/compare_models.py --report-only` | Tables for ResNet18, EfficientNet-B0, MobileNetV3-Large match `metrics_cprd.json` | H | A |
| TC-ML-04 | FR-RES-05 | `python qml/src/quantum_model.py --self-test` and `--check-pennylane` | Simulator gradients and PennyLane outputs agree within tolerance | H | A |
| TC-ML-05 | FR-RES-05 | `python qml/src/qnn_features.py --check` | QNN encoding equals VQC simulator output | M | A |
| TC-ML-06 | FR-RES-05 | Open `qml/notebooks/qnn.ipynb`, run all | Saved QNN / hybrid weights reproduce the reported test metrics | M | M |
| TC-ML-07 | NFR-ML-01 | Evaluate the served ResNet18 on the shared 300-patch test set | Macro-F1 ≥ 0.80 | H | A |
| TC-ML-08 | FR-RES-07 | Repeat TC-ML-02/03 with the unseen-highway split | Results files for `*_unseen_highway` produced | M | A |

### 7.9 Client and end-to-end (TC-UI)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-UI-01 | UI-02 | Sign in as citizen, admin and department | Correct dashboard for each | H | A/M |
| TC-UI-02 | FR-AUTH-08 | Log out, reload page | Back on sign-in; `localStorage` cleared | H | A/M |
| TC-UI-03 | UI-03 | Client-side image check: choose a GIF | Error shown before upload | M | A |
| TC-UI-04 | End-to-end | Citizen submits with photo → admin assigns → department accepts, progresses, completes → admin resolves → citizen views | Each role sees correct status and full progress history | C | M |
| TC-UI-05 | UI-06 | Repeat sign-in and citizen dashboard at 375 px width | No horizontal scroll; all controls usable | M | M |
| TC-UI-06 | NFR-ACC-01 | Keyboard-only form completion; screen reader reads errors | All controls reachable; errors announced | M | M |

### 7.10 Deployment smoke tests (TC-SYS)

| ID | Req. | Scenario | Expected result | Pri. | Type |
|---|---|---|---|---|---|
| TC-SYS-01 | NFR-POR-01 | `docker compose up --build` | 3 containers running; `GET :5050/api/health` and `GET :8000/health` return 200 | H | M |
| TC-SYS-02 | NFR-POR-01 | `kubectl apply -f k8s/`; `kubectl get pods` | 3 pods `Running`; services resolve | H | M |
| TC-SYS-03 | NFR-REL-01 | Scale `dl` to 0; submit complaint with image | 201; AI `Failed` | H | M |
| TC-SYS-04 | NFR-REL-02 | Start backend without `MONGODB_URI` | Process exits with clear log message | M | M |

The 47 lower-level cases in `testing/test-cases.md` (TC01–TC47) refine the API cases above; 41 of them are automated in `testing/automated/` (45 Jest tests).

---

## 8. Test Environment

| Element | Configuration |
|---|---|
| OS | macOS / Windows / Ubuntu (CI: `ubuntu-latest`) |
| Node.js | 24 |
| Python | 3.11 (DL container), 3.12 (CI lint) |
| Database | mongodb-memory-server for automated tests; MongoDB Atlas test cluster for manual tests |
| Services | client `:5173`, backend `:5050`, DL `:8000` |
| Browser | Latest Chrome (desktop and 375 px mobile emulation) |
| GPU (model training only) | NVIDIA RTX 3050 6 GB Laptop GPU |
| Environment variables | `MONGODB_URI`, `JWT_SECRET`, `DL_API_URL`, `DEPT_*_PASSWORD`, optional `DL_MODEL_PATH` |

### 8.1 Commands

| Suite | Command |
|---|---|
| Backend | `cd server && npm test` |
| QA API suite | `bash testing/run-tests.sh` |
| Frontend | `cd client && npm test` |
| DL API | `cd dl && python -m pytest tests -q` |
| Python lint | `pylint --rcfile=pyproject.toml dl/src/*.py` |

---

## 9. Test Deliverables

Test plan (this document); test case specification (`testing/test-cases.md`); automated test code; test logs and `testing/test-results.md`; defect reports (`testing/bug-reports/`); model evaluation reports (`dl/results/comparison/*.md`, `qml/results/metrics/*.md`); CI run history in GitHub Actions; unit testing report (`TrafficCare_Unit_Testing_Report.pdf`).

---

## 10. Current Status and Reported Results

Results below are copied from the repository's own records; they are not re-executed by this document.

| Suite | Tool | Last reported result | Source |
|---|---|---|---|
| Backend | Jest | 9 suites, 95/95 tests passed (17 Nov 2026) | `TrafficCare_Code_Coverage_Report.docx` |
| DL API | unittest / pytest | 14/14 tests passed (model mocked in the prediction tests) | `TrafficCare_Code_Coverage_Report.docx` |
| Frontend | Vitest | 6 files, 37/37 tests passed | `TrafficCare_Code_Coverage_Report.docx` |
| Python lint | Pylint | 8.97 / 10 | Root README |
| QA API suite | Jest (`testing/automated`) | 45/45 passed; BUG-001…005 verified fixed | `testing/test-results.md` |
| System tests (live stack) | HTTP, Chrome end-to-end, Docker Compose, Kubernetes | 106/106 passed after fixing BUG-007/008 (first run 102/104) | `TrafficCare_System_Test_Report` |
| Code and branch coverage | Jest, Vitest v8, coverage.py | 83.2 % statements, 78.8 % branches (all 146 tests passed) | `TrafficCare_Code_Coverage_Report.docx` |
| Model evaluation | scripts | Completed: see SAD §8.3 for all 10 models | `dl/results`, `qml/results` |

### 10.1 Defect status

| Bug | Summary | Code status on `main` | Required action |
|---|---|---|---|
| BUG-001 | Any category accepted | Allow-list now present in `complaintRoutes.js` | Verified 16 Nov 2026 |
| BUG-002 | Long description → 500 | Mongoose validation now mapped to 400 | Verified 16 Nov 2026 |
| BUG-003 | Long name → 500 | Validation now mapped to 400 | Verified 16 Nov 2026 |
| BUG-004 | Invalid e-mail accepted | E-mail regex now present | Verified 16 Nov 2026 |
| BUG-005 | Malformed JSON shows stack trace | JSON error handler now present in `app.js` | Verified 16 Nov 2026 |
| BUG-006 | Duplicate setup in `index.js` | `index.js` now only bootstraps | Verified 16 Nov 2026 |
| BUG-007 | Citizen dashboard hides progress history and department | Fixed in `c4ca873` | Verified 17 Nov 2026 (UI-12) |
| BUG-008 | Admin card shows reporter "Unknown" after update | Fixed in `c4ca873` | Verified 17 Nov 2026 (UI-08b) |

A defect moves to **Verified** only after its tagged test passes and the full suite shows no regression.

---

## 11. Schedule and Responsibilities

| Activity | Responsible | When |
|---|---|---|
| Maintain plan and API cases | QA lead | Each sprint |
| Backend and API automation | Backend developer + QA | Every change to `server/` |
| Frontend tests | Frontend developer | Every change to `client/` |
| DL service tests and lint | DL developer | Every change to `dl/src` |
| Model evaluation reports | DL and QML owners | After each training run |
| Manual end-to-end and UI cases | QA lead | Before each release / demo |
| Deployment smoke tests | DevOps owner | After image or manifest changes |
| Sign-off | Project owner | Release |

## 12. Risks and Contingencies

| Risk | Effect | Contingency |
|---|---|---|
| MongoDB Atlas unavailable | System tests blocked | Use local MongoDB or in-memory server |
| Model checkpoint not pulled (DVC) | DL service fails to start | Use `DL_MODEL_PATH` with a comparison checkpoint |
| GPU unavailable | Model training slow | Use saved metrics and `--report-only`; CPU for evaluation |
| Flaky timing tests (30 s timeout) | False failures | Mock the DL call with a fake timer |
| Mocked model hides real errors | Contract tests pass while model is wrong | TC-ML-07 evaluates the real model |

## 13. Approvals

| Role | Name | Signature | Date |
|---|---|---|---|
| Project owner | | | |
| QA lead | | | |
| Development lead | | | |

## Appendix: Requirement coverage summary

| SRS group | Test cases | Count |
|---|---|---|
| FR-AUTH | TC-AUTH-01 … 11, TC-SEC-01 … 05, TC-UI-01/02 | 18 |
| FR-CMP | TC-CMP-01 … 11 | 11 |
| FR-AI | TC-AI-01 … 03, TC-DL-01 … 06 | 9 |
| FR-ADM | TC-ADM-01 … 10 | 10 |
| FR-DEP | TC-DEP-01 … 08 | 8 |
| FR-RES / NFR-ML | TC-ML-01 … 08 | 8 |
| NFR (security, reliability, portability, usability) | TC-SEC-06 … 08, TC-SYS-01 … 04, TC-UI-03 … 06 | 11 |
