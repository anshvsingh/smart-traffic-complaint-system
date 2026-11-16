# Unit Testing Report

## TrafficCare: Smart Traffic Complaint and Monitoring System

| Item | Value |
|---|---|
| Document | Unit Testing Report |
| Version | 2.1 |
| Date | 17 November 2026 |
| Code tested | Branch `docs/update-srs-sad-stp-uml` (pull request #20) |
| Related documents | TrafficCare_STP, TrafficCare_Code_Coverage_Report |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | Nov 2026 | Backend 6 suites, frontend 3 files, DL 6 tests: 59 / 59 passed |
| 2.0 | 16 Nov 2026 | Re-run after 73 new backend and frontend tests: backend 9 suites / 93 tests, frontend 5 files / 34 tests. DL results unchanged from v1.0. 133 / 133 passed |
| 2.1 | 17 Nov 2026 | Re-run after fixing BUG-007 and BUG-008 found in system testing: +2 backend and +3 frontend regression tests. Backend 95, frontend 37, DL 6: 138 / 138 passed |

---

## 1. Introduction

TrafficCare is a Smart Traffic Complaint System. Citizens report traffic problems and upload photos, administrators review and assign complaints, and municipal departments resolve them. It uses a React + Node.js/Express + MongoDB architecture with a deep-learning (ResNet18) service that classifies road images as Road Damage, Normal Road or Pothole.

Unit testing verifies that individual modules and components behave correctly on their own. This report documents the unit tests of the backend, frontend and deep-learning modules.

**What changed since version 1.0.** Version 1.0 had no tests for the department workflow, the department dashboard, department-account creation, complaint assignment or the image-upload / AI-prediction path. Version 2.0 added 52 backend and 21 frontend tests for these areas. Version 2.1 adds 5 regression tests for two defects found in system testing (BUG-007, BUG-008) and re-runs everything.

## 2. Objectives of Unit Testing

1. Verify the correctness of individual software modules.
2. Identify errors in authentication and authorisation.
3. Validate complaint management, including image upload and the AI prediction fallback.
4. Validate the administrator workflow: department accounts, assignment, status and priority, resolution.
5. Validate the department workflow: accept, progress, completion and department scoping.
6. Verify database connection handling.
7. Verify the behaviour of all React dashboards.
8. Verify the deep-learning prediction API responses and input validation.
9. Ensure that invalid inputs are handled with controlled errors.

## 3. Testing Environment

| Component | Technology |
|---|---|
| Operating system | macOS (Apple Silicon) |
| Backend | Node.js, Express 5, Mongoose 9 |
| Backend testing | Jest 30, Supertest, mongodb-memory-server (in-memory MongoDB) |
| Frontend | React 19, Vite 8 |
| Frontend testing | Vitest 5.0.5, React Testing Library, jsdom |
| Deep-learning API | Python 3.12, FastAPI, PyTorch, Pillow |
| DL testing | Python unittest / pytest with FastAPI TestClient |
| Model architecture | ResNet18 |

External services are isolated: the database is an in-memory MongoDB created for each test file, the DL service is replaced by a mocked `fetch` in backend tests, and HTTP calls are mocked with `vi.mock('axios')` in frontend tests.

---

## 4. Backend Unit Testing

Test execution command:

```
cd server && npm test
```

### 4.1 Test files

| Sl. No. | Test file | Description | Tests | Status |
|---|---|---|---|---|
| 1 | `admin.test.js` | Admin authorisation, complaint listing, status/priority updates, dashboard counts | 13 | Existing |
| 2 | `complaint.test.js` | Complaint creation, validation, ownership and retrieval | 9 | Existing |
| 3 | `auth.test.js` | Registration and login | 7 | Existing |
| 4 | `authMiddleware.test.js` | Malformed, expired, wrong-secret and deleted-user tokens; missing secret | 5 | Existing |
| 5 | `app.test.js` | Welcome route, health check, unknown routes, auth guards | 6 | Existing |
| 6 | `mongo-connection.test.js` | Connection to the in-memory MongoDB | 1 | Existing |
| 7 | `department.test.js` | Department role guard; list scoped to own department; accept (valid, twice, invalid ID, other department); progress before acceptance; Work in Progress → Work Completed with history; message length 0 / 1,000 / 1,001; department cannot set Resolved or use the admin API | 18 | **New** |
| 8 | `adminWorkflow.test.js` | Create department account (valid, each missing field, short password, duplicate, citizen forbidden); assign, reassign with history, unknown department, invalid/missing IDs; Resolved also completes the department status; **v2.1:** assign and update responses include the reporter (BUG-008) | 18 | **New** |
| 9 | `complaintImage.test.js` | JPEG/PNG upload with server-generated names; `nosniff` header; AI prediction `Completed`; AI `Failed` when the DL service is unreachable, returns 500, `success:false`, a malformed body, or times out; GIF, > 10 MB and multiple-file rejection; uploaded file deleted on validation errors; malformed JSON → 400; generic 500 without leaking details | 18 | **New** |
| | **Total** | | **95** | |

### 4.2 Backend test execution results

| Parameter | Result |
|---|---|
| Total test suites | 9 |
| Passed test suites | 9 |
| Failed test suites | 0 |
| Total test cases | 95 |
| Passed test cases | 95 |
| Failed test cases | 0 |
| Execution time | 66.147 seconds |

Jest output: **9 of 9 test suites and 95 of 95 tests passed (66.147 s).** The v2.0 run (93 tests) was 61.079 s.

Execution time rose from 18.9 s to 61.1 s because each of the three new suites starts its own in-memory MongoDB, and the upload tests include a 10 MB file.

---

## 5. Frontend Unit Testing

Test execution command:

```
cd client && npm test
```

### 5.1 Test files

| Sl. No. | Test file | Description | Tests | Status |
|---|---|---|---|---|
| 1 | `AdminDashboard.test.jsx` | Renders the admin dashboard, status filter, logout on 401 | 3 | Existing |
| 2 | `Dashboard.test.jsx` | Citizen dashboard and image validation | 5 | Existing |
| 3 | `App.test.jsx` | Application shell, sign-in and registration | 5 | Existing |
| 4 | `DepartmentDashboard.test.jsx` | Loading, statistics, empty and error states with retry; accept assignment; progress message required; progress and completion requests; error messages; details modal with history; logout | 11 | **New** |
| 5 | `AdminDashboardActions.test.jsx` | Reporter and AI analysis display; assign (no selection, success, server error); status and priority updates with statistics refresh; update errors; logout on 401; load error; logout | 10 | **New** |
| 6 | `DashboardTracking.test.jsx` | **v2.1, BUG-007:** citizen card shows "Handled by" department; progress history newest first with role and time; "Not yet assigned" without an empty history | 3 | **New** |
| | **Total** | | **37** | |

### 5.2 Frontend test execution results

| Parameter | Result |
|---|---|
| Total test files | 6 |
| Passed test files | 6 |
| Failed test files | 0 |
| Total test cases | 37 |
| Passed test cases | 37 |
| Failed test cases | 0 |
| Execution time | 2.51 seconds |

Vitest output: **6 of 6 test files and 37 of 37 tests passed (2.51 s).**

---

## 6. Deep-Learning Module Unit Testing

The deep-learning module classifies uploaded road images into Road Damage, Normal Road and Pothole using a trained ResNet18 model served by FastAPI.

| File | Description |
|---|---|
| `src/api.py` | FastAPI prediction API |
| `src/predict.py` | Image-based prediction |
| `models/best_model.pth` | Trained model weights (DVC) |

Test execution command:

```
cd dl && python -m unittest discover -s tests -v
```

The results below are from the version 1.0 run and were not re-executed for this version; the DL API code has not changed since.

| Test ID | Test case | Expected result | Status |
|---|---|---|---|
| DL-01 | Health endpoint | Returns success and model-loaded status | PASS |
| DL-02 | Unsupported file type | Rejects unsupported file formats | PASS |
| DL-03 | Empty image upload | Rejects empty image files | PASS |
| DL-04 | Oversized image upload | Rejects images exceeding 10 MB | PASS |
| DL-05 | Corrupted image upload | Rejects invalid or corrupted images | PASS |
| DL-06 | Valid image prediction | Returns category, confidence and probabilities | PASS |

| Parameter | Result |
|---|---|
| Total test cases | 6 |
| Passed test cases | 6 |
| Failed test cases | 0 |
| Execution time | 4.255 seconds |

**Note.** The valid-prediction test uses a mock model. It verifies prediction handling and the response format, not the real model's classification accuracy. Eight further DL error-path tests (`tests/test_api_errors.py`) were added for coverage measurement and are reported in TrafficCare_Code_Coverage_Report.

---

## 7. Consolidated Unit Testing Results

| Parameter | Backend | Frontend | Deep Learning | Total |
|---|---|---|---|---|
| Test suites / files | 9 | 6 | 1 | 16 |
| Test cases | 95 | 37 | 6 | 138 |
| Passed | 95 | 37 | 6 | **138** |
| Failed | 0 | 0 | 0 | **0** |
| Pass rate | 100 % | 100 % | 100 % | **100 %** |

### 7.1 Comparison with version 1.0

| Module | v1.0 tests | v2.1 tests | Added |
|---|---|---|---|
| Backend | 40 | 95 | +55 (54 new tests, plus 1 existing test not counted in v1.0) |
| Frontend | 13 | 37 | +24 |
| Deep Learning | 6 | 6 | 0 |
| **Total** | **59** | **138** | **+79** |

### 7.2 Areas covered

| Area | v1.0 | v2.1 |
|---|---|---|
| Registration, login, tokens | Tested | Tested |
| Complaint creation, validation, ownership | Tested | Tested |
| Image upload and AI prediction / fallback | Not tested | **Tested** |
| Admin listing, status, priority, dashboard | Tested | Tested |
| Department account creation and assignment | Not tested | **Tested** |
| Department workflow (accept, progress, complete) | Not tested | **Tested** |
| Department dashboard (React) | Not tested | **Tested** |
| Admin dashboard actions (React) | Partly | **Tested** |
| Citizen progress history and department (React) | Not tested | **Tested** |
| Error handling (malformed JSON, 500) | Not tested | **Tested** |
| DL API validation and prediction | Tested | Tested |

Statement and branch coverage for these tests is reported in TrafficCare_Code_Coverage_Report (backend 79.7 % / 83.7 %, frontend 84.3 % / 75.7 %).

---

## 8. Warnings and Observations

### 8.1 Backend

- Node.js shows an experimental VM Modules warning because the test script enables `--experimental-vm-modules`.
- The console shows `JWT_SECRET is not configured` with a stack trace. This is expected: `authMiddleware.test.js` removes the secret on purpose to check that the server refuses requests safely. It is not a failure.
- The new upload tests replace `fetch`, so no real network calls are made, and they delete every file they upload.

### 8.2 Frontend

- No warnings affected the run.

### 8.3 Deep learning

- Starlette shows a deprecation warning about using `httpx` with its TestClient. It does not affect results.

None of these warnings caused a test failure.

## 9. Limitations of Testing

1. The DL prediction test uses a mock model, so unit tests do not measure the accuracy of the trained ResNet18 model. Model accuracy is reported separately in `dl/results/`.
2. The DL module was not re-run for versions 2.0 and 2.1, and its results are carried over from version 1.0.
3. Server start-up code (`index.js`, `config/db.js`, `seedDepartments.js`) needs a real database and is covered by system testing, not unit testing.
4. Browser-level end-to-end and performance testing are not part of unit testing. They belong to the System Test Report.

## 10. Conclusion

Unit testing was repeated after the test suite was extended and two defects found in system testing were fixed. All 9 backend suites (95 tests), all 6 frontend test files (37 tests) and the 6 deep-learning tests pass: **138 of 138 unit tests passed, with zero failures.** The department workflow, department-account management, complaint assignment, image upload with AI fallback, and the department and admin dashboards, all untested in version 1.0, are now covered. The tested backend, frontend and deep-learning components behave as expected for the tested scenarios.
