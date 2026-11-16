# Product Backlog

## TrafficCare: Smart Traffic Complaint and Monitoring System

| Item | Value |
|---|---|
| Document | Product Backlog |
| Version | 1.0 |
| Date | 17 November 2026 |
| Product owner | Ansh Vardhan Singh (`anshvsingh`) |
| Team | `anshvsingh` (backend, admin, DevOps, documents), `aryaappaji25` (frontend), Arnav Choudhary (`arnavchoudhary141`, deep learning, MLOps), `Avi-trace` (QML, QA, UX redesign) |
| Source of truth | GitHub issues #2–#5 and #9–#12, pull requests #1, #6–#8 and #13–#24, and the commit history of `anshvsingh/smart-traffic-complaint-system` |
| Related documents | TrafficCare_SRS (requirement IDs), TrafficCare_STP, TrafficCare_System_Test_Report |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | 17 Nov 2026 | Backlog consolidated from the GitHub issues, pull requests and commits; open items added from the SRS, SAD and test reports |

---

## 1. Purpose

This backlog lists all the work for TrafficCare as user stories, grouped into epics. Each story has a priority, an estimate, acceptance criteria, an owner, a status and the evidence (issue, pull request or commit) that shows it was delivered. It also holds the open items that remain for future iterations.

## 2. Conventions

| Field | Meaning |
|---|---|
| **ID** | `PB-xx`, stable identifier used in sprint documents |
| **Story** | *As a <role>, I want <goal>, so that <benefit>* |
| **Priority** | MoSCoW: **M**ust, **S**hould, **C**ould, **W**on't (this release) |
| **SP** | Story points, Fibonacci scale (1, 2, 3, 5, 8, 13), relative effort. Points for delivered stories are estimated after the fact from the size of the change |
| **Status** | **Done** = merged to `main` and tested · **Open** = not started · **Partial** = started, not complete |
| **Evidence** | GitHub issue (#n), pull request (PR #n) or commit |

**Definition of Done:** the code is merged to `main` through a pull request; automated tests for the story pass in CI (backend tests, frontend build, Pylint); the acceptance criteria are verified by a unit, API or system test; and the documentation is updated where behaviour changed.

---

## 3. Epics

| Epic | Name | Goal | Stories | SP | Done |
|---|---|---|---|---|---|
| E1 | Platform foundation | Backend, database and project set-up | 3 | 8 | 3 |
| E2 | Authentication and access control | Secure accounts and role-based access | 4 | 13 | 4 |
| E3 | Citizen complaint reporting | Citizens report and track problems | 5 | 21 | 5 |
| E4 | AI road-damage classification | Photos classified automatically | 3 | 18 | 3 |
| E5 | Administration | Review, prioritise, assign and resolve | 5 | 21 | 5 |
| E6 | Department workflow | Departments accept and complete work | 3 | 13 | 3 |
| E7 | User experience | Clear, accessible, responsive interface | 3 | 13 | 3 |
| E8 | ML / DL / QML research | Compare 2+ ML, DL and QML algorithms | 4 | 34 | 4 |
| E9 | DevOps and MLOps | Build, test, ship and track automatically | 8 | 35 | 8 |
| E10 | Quality assurance | Tests and reports at every level | 6 | 33 | 6 |
| E11 | Documentation | SRS, SAD, STP, UML and reports | 2 | 10 | 2 |
| E12 | Future enhancements | Items not yet built | 14 | 57 | 0 |
| | **Total** | | **60** | **276** | **46** |

---

## 4. Delivered Backlog Items

### E1 Platform foundation

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-01 | As a developer, I want an Express backend with a health endpoint, so that the team has a running API to build on | M | 2 | `npm start` serves the API; `GET /api/health` returns 200; JSON body parsing enabled | anshvsingh | Done | #2, PR #1 |
| PB-02 | As a developer, I want the backend connected to MongoDB, so that users and complaints are stored persistently | M | 3 | Connection string from `.env`; server exits with a clear message if the database is unreachable | anshvsingh | Done | #3, PR #6 |
| PB-03 | As a developer, I want a repository with a README and `.gitignore`, so that secrets and build output are never committed | M | 3 | `.env`, `node_modules`, uploads and datasets ignored; README explains set-up | anshvsingh | Done | commit `chore: add project documentation and gitignore` |

### E2 Authentication and access control

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-04 | As a citizen, I want to register with my name, e-mail and password, so that I can report problems | M | 3 | 201 on success; e-mail unique (case-insensitive); password ≥ 8 characters, stored as bcrypt hash; role always `citizen` | anshvsingh | Done | #5, PR #6 |
| PB-05 | As a user, I want to sign in and stay signed in, so that I can use my dashboard | M | 3 | 1-hour JWT returned; same error for unknown e-mail and wrong password | anshvsingh | Done | #5, PR #6 |
| PB-06 | As the system owner, I want every protected route to check the token and the user's role in the database, so that nobody can access data they shouldn't | M | 5 | Missing/expired/forged token → 401; wrong role → 403; role read from the database, not the token | anshvsingh | Done | PR #7 |
| PB-07 | As a citizen, I want sign-in and registration screens, so that I can create an account and log in from the browser | M | 2 | Forms with validation and error messages; dashboard opens for the user's role | aryaappaji25 | Done | #11, PR #13 |

### E3 Citizen complaint reporting

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-08 | As a citizen, I want to submit a complaint with category, description and location, so that the authorities know about the problem | M | 5 | 11 allowed categories; required fields validated; defaults Submitted / Medium priority | anshvsingh | Done | #4, PR #6 |
| PB-09 | As a citizen, I want to see only my own complaints and their status, so that my reports stay private and I can track them | M | 3 | List newest first; another citizen's complaint returns 404 | anshvsingh | Done | PR #7 |
| PB-10 | As a citizen, I want a dashboard to submit and track complaints, so that I don't need to use the API | M | 5 | Form, list of own complaints with status, success and error messages | aryaappaji25 | Done | #12, PR #13 |
| PB-11 | As a citizen, I want to attach a photo of the problem, so that the department can see it | S | 5 | JPEG/PNG up to 10 MB; server-generated file name; other types rejected with a clear message | anshvsingh | Done | commit `e986f19` |
| PB-12 | As a citizen, I want to see which department is handling my complaint and its progress history, so that I know what has been done | S | 3 | "Handled by" department and timeline of updates, newest first | anshvsingh | Done | BUG-007 fix, PR #21 |

### E4 AI road-damage classification

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-13 | As an administrator, I want uploaded road photos classified as Road Damage, Normal Road or Pothole, so that I can triage complaints faster | S | 8 | ResNet18 model trained and evaluated; FastAPI `POST /predict` returns class, confidence and probabilities | arnavchoudhary141 | Done | #9, PR #14 |
| PB-14 | As a citizen, I want my complaint accepted even if the AI service is down, so that reporting never fails because of AI | M | 5 | DL error or 30 s timeout → AI status Failed, complaint still created | anshvsingh | Done | commit `e986f19`; system test SYS-41 |
| PB-15 | As an administrator, I want the AI result shown on each complaint, so that I can use it when assigning | S | 5 | Prediction and confidence visible on admin and citizen cards | anshvsingh | Done | commit `e986f19` |

### E5 Administration

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-16 | As an administrator, I want to see all complaints with reporter details, so that I can review them | M | 3 | All complaints listed; reporter name and e-mail; no passwords | anshvsingh | Done | PR #7 |
| PB-17 | As an administrator, I want to change a complaint's status and priority, so that work is prioritised | M | 5 | 9 allowed statuses, 3 priorities; invalid values → 400; status change recorded in history | anshvsingh | Done | PR #7, commit `7176351` |
| PB-18 | As an administrator, I want a dashboard with complaint counts, so that I can see the workload | S | 3 | Total and counts per status | anshvsingh | Done | commit `7176351` |
| PB-19 | As an administrator, I want to assign or reassign a complaint to a department, so that the right team fixes it | M | 5 | Department must exist; reassignment recorded in history; card keeps reporter details after update | anshvsingh | Done | commit `385664a`; BUG-008 fix, PR #21 |
| PB-20 | As an administrator, I want to create department accounts and verify completed work before resolving, so that departments can't close complaints themselves | M | 5 | Admin-only account creation; only admin can set Resolved | anshvsingh | Done | commit `385664a` |

### E6 Department workflow

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-21 | As a department user, I want to see only complaints assigned to my department, so that I focus on my work | M | 3 | Scoped list; other departments' complaints return 404 | anshvsingh | Done | commit `385664a` |
| PB-22 | As a department user, I want to accept an assignment and post progress updates, so that the administrator and citizen can follow the work | M | 5 | Accept only from Assigned; progress only after acceptance; message ≤ 1,000 characters | anshvsingh | Done | commit `385664a` |
| PB-23 | As a department user, I want to mark work completed, so that the administrator can verify and resolve it | M | 5 | Work Completed status; awaiting admin verification shown | anshvsingh | Done | commit `385664a` |

### E7 User experience

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-24 | As a user, I want a clean, consistent design with smooth motion, so that the app is pleasant and easy to use | S | 5 | Unified design system across all dashboards; reduced-motion respected | Avi-trace | Done | PR #18 |
| PB-25 | As a user with accessibility needs, I want readable contrast, labels and announced errors, so that I can use the app | S | 5 | WCAG AA colours; form labels; errors with `role="alert"`; keyboard sign-in works | Avi-trace | Done | PR #18; system test UI-15 |
| PB-26 | As a citizen on a phone, I want the app to fit my screen, so that I can report on the street | S | 3 | No horizontal scrolling at 375 px | Avi-trace | Done | PR #18; system test UI-14 |

### E8 ML / DL / QML research

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-27 | As the project team, we want two or more classical ML algorithms evaluated, so that we have a baseline | M | 5 | Logistic Regression, SVM, Random Forest on a shared, grouped test set | Avi-trace | Done | PR #15 |
| PB-28 | As the project team, we want two or more DL models compared, so that the served model is justified | M | 8 | ResNet18, EfficientNet-B0, MobileNetV3-Large; 3 seeds; McNemar tests | Avi-trace | Done | PR #18 |
| PB-29 | As the project team, we want two or more QML algorithms evaluated against classical controls, so that we can report honestly on quantum ML | M | 13 | VQC, QSVM, QNN and hybrid ResNet18+QNN; simulator only; classical controls | Avi-trace | Done | #10, PR #15, PR #18 |
| PB-30 | As an evaluator, I want all models scored on the same test patches, so that results are comparable | M | 8 | Identical 300-patch test set; no test data used for fitting or selection | Avi-trace | Done | PR #15, PR #18 |

### E9 DevOps and MLOps

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-31 | As a developer, I want every push tested automatically, so that broken code doesn't reach `main` | M | 3 | GitHub Actions: backend tests, frontend build, Pylint | anshvsingh, arnavchoudhary141 | Done | commit `1a0257c`, PR #17 |
| PB-32 | As a developer, I want each service in a Docker container, so that the app runs the same everywhere | M | 5 | Dockerfiles for client, backend, DL; `docker compose up --build` starts all three | anshvsingh | Done | commit `e63ef74`; system test SYS-44 |
| PB-33 | As a developer, I want images published to Docker Hub, so that Kubernetes can pull them | S | 2 | `ansh6625/smart-traffic-complaint-system-*` images | anshvsingh | Done | `k8s/*.yaml`; system test SYS-45 |
| PB-34 | As an operator, I want Kubernetes deployments and services, so that the app runs on a cluster | S | 5 | 3 deployments and ClusterIP services; pods Running | anshvsingh | Done | commit `68c467e`; SYS-45 |
| PB-35 | As a data scientist, I want training runs tracked in MLflow, so that experiments are reproducible | S | 5 | Parameters, per-epoch metrics and artifacts logged; recorded run with screenshots | arnavchoudhary141, anshvsingh | Done | PR #17, PR #23 (`dl/results/mlflow/`) |
| PB-36 | As a data scientist, I want the dataset and model versioned with DVC on shared storage, so that the team can pull them | S | 5 | `.dvc` files; Google Drive remote; model pushed and in sync | arnavchoudhary141, anshvsingh | Done | PR #17, PR #23, PR #24 |
| PB-37 | As a developer, I want Python code quality checked, so that the DL code stays maintainable | S | 2 | Pylint in CI with project rules | arnavchoudhary141 | Done | PR #17 |
| PB-38 | As a QA engineer, I want browser tests in Playwright, so that the user journeys are tested automatically | S | 8 | 16 end-to-end steps pass on the running stack, with screenshots | anshvsingh | Done | PR #23 |

### E10 Quality assurance

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-39 | As a developer, I want backend unit and API tests, so that regressions are caught | M | 5 | Jest + Supertest with in-memory MongoDB; 95 tests pass | anshvsingh | Done | PR #8, PR #20, PR #21 |
| PB-40 | As a developer, I want frontend and DL unit tests, so that the UI and model API are verified | M | 5 | Vitest 37 tests; PyUnit 14 tests | anshvsingh | Done | commit `4ffc4a9`, PR #20 |
| PB-41 | As a QA engineer, I want a traceable API test suite and bug reports, so that defects are found and fixed | M | 5 | TC01–TC41 automated (45 tests); BUG-001…008 all verified | Avi-trace | Done | PR #15, PR #16 (fixes merged via PR #18) |
| PB-42 | As an evaluator, I want code and branch coverage measured, so that test quality is visible | S | 5 | Coverage report: 83.2 % statements, 78.8 % branches | anshvsingh | Done | PR #20, PR #21 |
| PB-43 | As an evaluator, I want the whole system tested end to end, so that requirements are proven on the running system | M | 8 | System Test Report: 106 / 106 cases pass incl. Docker and Kubernetes | anshvsingh | Done | PR #21, PR #22, PR #23 |
| PB-44 | As a user, I want defects found in testing fixed and re-tested, so that the release is reliable | M | 5 | BUG-007 and BUG-008 fixed with regression tests | anshvsingh | Done | PR #21 |

### E11 Documentation

| ID | Story | Pri. | SP | Acceptance criteria | Owner | Status | Evidence |
|---|---|---|---|---|---|---|---|
| PB-45 | As an evaluator, I want SRS, SAD, STP and UML documents, so that the system is specified and designed | M | 8 | Standards-based documents in Word and Markdown, 14 UML diagrams | anshvsingh | Done | PR #19, PR #20 |
| PB-46 | As an evaluator, I want UX design and evaluation documented, so that design decisions are explained | S | 2 | Screen inventory, transitions, heuristic evaluation | Avi-trace, anshvsingh | Done | PR #18; `updated-docs/ux/` |

---

## 5. Open Backlog Items (future iterations)

Ordered by priority. These come from the SRS out-of-scope list (§2.7), SAD technical debt (§13) and test-report observations.

| ID | Story | Pri. | SP | Acceptance criteria | Source | Status |
|---|---|---|---|---|---|---|
| PB-47 | As a data scientist, I want the original training dataset pushed to DVC with its source and licence documented, so that the model can be retrained | M | 3 | `dvc push` of `dl/datasets/raw`; dataset name, link and licence in `dl/README.md` | DVC set-up, PR #24 | Partial (model pushed; dataset and source pending) |
| PB-48 | As an operator, I want the frontend served as built static files, so that production doesn't run a development server | S | 3 | Nginx (or similar) image serving `vite build` output; API URL from environment | SAD §13, SYS-45 | Open |
| PB-49 | As the system owner, I want login attempts rate-limited, so that passwords can't be brute-forced | S | 2 | Repeated failed logins → 429 | SAD §13 | Open |
| PB-50 | As the system owner, I want the server to enforce allowed status transitions, so that the workflow can't be skipped | S | 3 | Invalid transitions (e.g. Submitted → Resolved) rejected | SAD §13 | Open |
| PB-51 | As an administrator, I want the department suggested from the category, so that assignment is faster | C | 2 | Selector pre-filled from SRS Appendix B mapping | SRS FR-ADM-04 | Open |
| PB-52 | As an administrator, I want server-side search, filters and pagination, so that the dashboard stays fast with many complaints | S | 5 | `limit`/`cursor` and filters on list endpoints | SAD §13 | Open |
| PB-53 | As a developer, I want Playwright and coverage thresholds in CI, so that regressions are blocked automatically | S | 5 | CI job runs the browser suite; coverage ≥ 75 % / 70 % enforced | Coverage Report §7 | Open |
| PB-54 | As a citizen, I want e-mail or SMS updates, so that I don't need to check the app | C | 8 | Notification on status change | SRS §2.7 | Open |
| PB-55 | As a citizen, I want to pick the location on a map, so that the department finds the exact place | C | 8 | Map picker with coordinates stored | SRS §2.7 | Open |
| PB-56 | As a citizen, I want to edit or withdraw a complaint before it is assigned, so that I can correct mistakes | C | 3 | Edit/withdraw allowed only while Submitted | README future improvements | Open |
| PB-57 | As a user, I want logout to invalidate my session on the server, so that a stolen token stops working | C | 5 | Refresh tokens or deny-list; HttpOnly cookie | SAD §13 | Open |
| PB-58 | As an operator, I want uploaded images in object storage, so that several backend replicas can share them | C | 5 | S3-compatible storage for `/uploads` | SAD §13 | Open |
| PB-59 | As a data scientist, I want to evaluate replacing ResNet18 with MobileNetV3-Large, so that inference is faster on CPU | C | 3 | Retrain on the production dataset; compare on the shared test set | SAD §8.3 | Open |
| PB-60 | As an administrator, I want a secure way to create administrator accounts, so that admins aren't created by editing the database | C | 2 | Provisioning script or protected endpoint | SAD §13 | Open |

**Open work:** 14 items, 57 story points (PB-47 counts its 3 points as partly done). Recommended next iteration: PB-47, PB-48, PB-49, PB-50 and PB-53 (16 points).

---

## 6. Summary

| Measure | Value |
|---|---|
| Backlog items | 60 (46 done, 1 partial, 13 open) |
| Story points delivered | 219 of 276 (79 %) |
| Must-have items | All done except the dataset part of PB-47 |
| Requirement coverage | Every functional requirement in the SRS maps to a delivered story (E2–E6); NFRs map to E7, E9 and E10 |
| Delivery period | 28 October – 17 November 2026: 8 issues, 16 pull requests (15 merged), 68 commits |
