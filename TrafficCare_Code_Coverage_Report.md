# Code and Branch Coverage Report

## TrafficCare: Smart Traffic Complaint and Monitoring System

| Item | Value |
|---|---|
| Document | Code and Branch Coverage Report |
| Version | 1.0 |
| Date | 16 November 2026 |
| Code measured | Branch `docs/update-srs-sad-stp-uml` (application code identical to `main` at commit `4afc3ff`) |
| Related documents | TrafficCare_STP (test plan), TrafficCare_Unit_Testing_Report.pdf |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | 16 Nov 2026 | First coverage measurement of backend, frontend and DL API |

---

## 1. Summary

All 60 automated unit tests passed during the coverage run: 41 backend, 13 frontend and 6 DL API. Coverage was measured for **statements** (code coverage) and **branches** (every `if`/`else`, `? :`, `&&`/`||` outcome).

| Module | Tests | Statements | Branches | Functions | Lines |
|---|---|---|---|---|---|
| Backend (`server/`) | 41 / 41 passed | 51.6 % (196/380) | 43.3 % (77/178) | 51.4 % (18/35) | 51.7 % |
| Frontend (`client/src/`) | 13 / 13 passed | 53.0 % (193/364) | 47.5 % (134/282) | 48.3 % (42/87) | 54.0 % |
| DL inference API (`dl/src/api.py`) | 6 / 6 passed | 87.5 % (63/72) | 62.5 % (10/16) | none reported | 87.5 % |
| **Overall** | **60 / 60 passed** | **55.4 % (452/816)** | **46.4 % (221/476)** | | |

![Coverage summary](testing/coverage-report/coverage-summary.png)

**Assessment.** The modules that the tests target are well covered: authentication, the complaint API, the auth middleware, the data models, the main client screens and the DL API (73–100 % statements). The overall figure is pulled down by two components that have **no tests at all**: the department API (`departmentRoutes.js`, 18 %) and the department dashboard (`DepartmentDashboard.jsx`, 1 %), plus server start-up code that unit tests do not run. Section 6 lists the tests that would raise coverage the most.

---

## 2. Scope and Method

### 2.1 What was measured

| Module | Files included | Excluded (and why) |
|---|---|---|
| Backend | Every `.js` file in `server/` | `node_modules/`, `tests/` |
| Frontend | `client/src/**/*.js(x)` | `src/test/**` (test code), `src/main.jsx` (only mounts React) |
| DL | `dl/src/api.py`, the deployed service | Offline training and analysis scripts (`train.py`, `evaluate.py`, `compare_models.py`, …): they are research scripts with no unit tests and are reported separately in §5.2 |

### 2.2 Tools

| Module | Test framework | Coverage tool | Coverage type |
|---|---|---|---|
| Backend | Jest 30 + Supertest + mongodb-memory-server (MongoDB 8.2.6) | Jest built-in (Istanbul) | Statement, branch, function, line |
| Frontend | Vitest 5.0.5 + React Testing Library (jsdom) | `@vitest/coverage-v8` 5.0.5 | Statement, branch, function, line |
| DL API | pytest + FastAPI TestClient | coverage.py with `--branch` | Statement, branch |

### 2.3 Environment

macOS (Apple Silicon), Node.js 24.6, Python 3.12, PyTorch 2.12.

### 2.4 Commands to reproduce

| Module | Command |
|---|---|
| Backend | `cd server && JWT_SECRET=test npm run test:coverage` |
| Frontend | `cd client && npm run test:coverage` (writes to `testing/coverage-report/frontend`) |
| DL API | `cd dl && DL_MODEL_PATH=<checkpoint> python -m coverage run --branch --source=src -m pytest tests && python -m coverage report -m` |

**Note on the DL checkpoint.** The production weights (`best_model.pth`) are stored with DVC and were not available. The DL tests therefore loaded an **untrained** ResNet18 checkpoint in the same format (same architecture and class mapping). Coverage measures which code runs, and the prediction test already uses a mocked model, so this does not change the results. It says nothing about model accuracy.

### 2.5 Full reports

Interactive HTML reports with line-by-line highlighting are committed in `testing/coverage-report/`:

| Module | HTML report | Machine-readable |
|---|---|---|
| Backend | `testing/coverage-report/backend/index.html` | `coverage-summary.json`, `cobertura-coverage.xml` |
| Frontend | `testing/coverage-report/frontend/index.html` | `coverage-summary.json`, `cobertura-coverage.xml` |
| DL API | `testing/coverage-report/dl/index.html` | `coverage.xml` |

---

## 3. Backend Coverage (Node.js / Express)

| File | Statements | Branches | Functions | Uncovered lines |
|---|---|---|---|---|
| `app.js` | 82.1 % (23/28) | 0 % (0/4) | 60.0 % | 26, 60–69 |
| `index.js` | 0 % (0/14) | 0 % (0/2) | 0 % | 2–28 |
| `seedDepartments.js` | 0 % (0/16) | 0 % (0/6) | 0 % | 2–72 |
| `config/db.js` | 0 % (0/11) | 0 % (0/2) | 0 % | 2–21 |
| `middleware/authMiddleware.js` | 81.3 % (26/32) | 72.7 % (16/22) | 66.7 % | 19, 60–62, 83–90 |
| `models/Complaint.js` | 100 % (3/3) | none | none | none |
| `models/User.js` | 90.0 % (9/10) | 50.0 % (1/2) | 100 % | 45 |
| `routes/authRoutes.js` | 73.7 % (28/38) | 75.0 % (21/28) | 100 % | 58–78, 115–117, 144–146 |
| `routes/complaintRoutes.js` | 59.0 % (49/83) | 40.9 % (18/44) | 50.0 % | 21–29, 40–46, 53, 112–159, 195–197, 217–219, 255–257, 266–283 |
| `routes/adminRoutes.js` | 53.3 % (48/90) | 46.7 % (21/45) | 66.7 % | 38–90, 115–117, 130–201, 288–290, 327–329 |
| `routes/departmentRoutes.js` | 18.2 % (10/55) | 0 % (0/23) | 0 % | 14–28, 37–85, 94–173 |
| **Total** | **51.6 %** | **43.3 %** | **51.4 %** | |

**What the uncovered code is:**

- **`departmentRoutes.js`:** no test file exists. Listing, accepting and posting progress are never exercised, so none of their 23 branches run.
- **`complaintRoutes.js`:** the whole image path is untested: Multer storage (21–29), the file filter (40–46), the call to the DL service and its fallback to `Failed` (112–159), and the Multer error handler (266–283).
- **`adminRoutes.js`:** department-account creation (38–90) and assign/reassign (130–201) have no tests. Status/priority updates and the dashboard are covered.
- **`authRoutes.js`:** the registration error paths (duplicate-key race, schema validation, 500) and login's missing-secret and 500 paths.
- **`app.js`:** the malformed-JSON handler and the generic 500 handler (60–69).
- **`index.js`, `config/db.js`, `seedDepartments.js`:** start-up code that connects to the real database. Unit tests import `app.js` directly, by design. These files are exercised by the system and deployment smoke tests (STP TC-AUTH-11, TC-SYS-01, TC-SYS-04), not by unit tests.

---

## 4. Frontend Coverage (React)

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `App.jsx` | 83.3 % (60/72) | 86.0 % (43/50) | 78.6 % | 82.6 % |
| `Dashboard.jsx` (citizen) | 69.8 % (74/106) | 54.0 % (34/63) | 88.2 % | 71.0 % |
| `AdminDashboard.jsx` | 53.1 % (52/98) | 56.3 % (54/96) | 51.9 % | 53.8 % |
| `Aura.jsx` | 54.5 % (6/11) | 75.0 % (3/4) | 50.0 % | 55.6 % |
| `DepartmentDashboard.jsx` | 1.3 % (1/77) | 0 % (0/69) | 0 % | 1.4 % |
| **Total** | **53.0 %** | **47.5 %** | **48.3 %** | **54.0 %** |

**What the uncovered code is:**

- **`DepartmentDashboard.jsx`:** no test file exists.
- **`AdminDashboard.jsx`:** the tests render the dashboard and its statistics, but do not run department assignment, status/priority changes or their error messages.
- **`Dashboard.jsx`:** complaint submission failures, some image-validation messages and the empty-list state are not tested.
- **`Aura.jsx`:** the decorative animation's mouse handlers (lines 13–18).

---

## 5. DL Coverage (Python / FastAPI)

### 5.1 Inference service `dl/src/api.py`

| Measure | Covered | Total | % |
|---|---|---|---|
| Statements | 63 | 72 | 87.5 % |
| Branches | 10 | 16 | 62.5 % |
| Combined (coverage.py) | | | 83.0 % |

Uncovered lines and why:

| Lines | Code | Reason |
|---|---|---|
| 32–35 | Device selection: Apple MPS / CUDA / CPU | Only one device branch can run on a given machine |
| 64, 76, 83 | `load_model()` errors: missing file, missing keys, wrong classes | No tests with broken checkpoints |
| 112 | `GET /` service-info endpoint | Not called by any test |
| 173–174 | Exception during inference → HTTP 500 | No test makes the model raise an error |

### 5.2 Offline research scripts (not unit-tested)

`train.py`, `evaluate.py`, `compare_models.py`, `model_zoo.py`, `predict.py`, `sample_predictions.py`, `inspect_dataset.py`, `visualize_dataset.py` and `check_duplicates.py` total 964 statements and are 0 % covered by unit tests. They are verified by running them and checking the saved results (STP §7.8, TC-ML-01…08), not by unit tests. The `qml/` module has built-in self-tests (`quantum_model.py --self-test`, `qnn_features.py --check`), which are outside this report.

---

## 6. Gaps and Recommended Tests

Ranked by how much coverage each would add.

| # | Add test | Covers | Expected gain |
|---|---|---|---|
| 1 | `server/tests/department.test.js`: list, accept (valid and twice), progress before acceptance, Work Completed, cross-department 404 (STP TC-DEP-01…08) | 45 statements, 23 branches | Backend branches +13 pts |
| 2 | Complaint image tests in `complaint.test.js`: JPEG/PNG upload, GIF and > 10 MB rejection, DL success, DL failure/timeout with a mocked `fetch` (TC-CMP-06…08, TC-AI-01…03) | 34 statements, 26 branches | Backend branches +15 pts |
| 3 | Admin tests for department creation and assign/reassign (TC-ADM-02…06) | about 40 statements | Backend statements +10 pts |
| 4 | `client/src/test/DepartmentDashboard.test.jsx`: render, accept, progress form | 76 statements, 69 branches | Frontend branches +24 pts |
| 5 | AdminDashboard interaction tests: assign, change status, error message | about 45 statements | Frontend statements +12 pts |
| 6 | Malformed JSON and 500 handler tests in `app.test.js` (TC-SEC-06) | 4 branches | Small; closes a security case |
| 7 | DL: broken-checkpoint tests for `load_model`, and a model that raises an error, for the 500 path | 6 statements, 4 branches | DL branches to ≈ 90 % |

Tests 1–5 would bring the overall project to roughly 70 % statement coverage and 65 % branch coverage. A 70 % threshold could then be enforced in CI (`coverageThreshold` in Jest, `thresholds` in Vitest).

---

## 7. Conclusion

All 60 unit tests pass. Measured coverage is 55.4 % of statements and 46.4 % of branches across the backend, frontend and DL API. The tested parts of the system are well covered: authentication, citizen complaints, the auth middleware, the models and the DL inference API (87.5 % statements). The main gap is the department workflow, which has no tests on either the server or the client. Adding the tests in §6, starting with the department API and the image-upload path, is the most effective way to raise both code and branch coverage.
