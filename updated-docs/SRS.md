# Software Requirements Specification

## TrafficCare — Smart Traffic Complaint and Monitoring System

**Version:** 1.0 · **Status:** Baseline for the repository implementation · **Date:** 14 November 2026

## 1. Purpose and scope

TrafficCare is a web system for submitting and managing traffic and road-condition complaints. Citizens submit a category, description, location, and optional JPG/PNG evidence image. Administrators review complaints, assign them to departments, set priority and status, and view aggregate status counts. Department users view complaints assigned to their department, accept assignments, and post work progress. An optional Deep Learning (DL) API classifies road images and stores its prediction with the complaint.

This specification describes behavior present in the repository. It does not claim geolocation, email/SMS notifications, map display, officer-level assignment, public deployment, or model accuracy guarantees.

## 2. System context and users

| Actor | Responsibilities |
|---|---|
| Citizen | Register, sign in, submit complaints, view own complaint list/details and tracking status. |
| Administrator | View all complaints, create department accounts, assign/reassign complaints, update status/priority, view dashboard counts. |
| Department user | View complaints assigned to the user's department, accept assignments, record progress, mark work completed. |
| External services | MongoDB stores users/complaints; DL service optionally classifies uploaded images. |

## 3. Functional requirements

### Authentication and authorization

- **FR-01** The system shall let a citizen register with name, email, and password. Email is normalized to lowercase; password must contain at least 8 characters.
- **FR-02** Registration shall assign the `citizen` role regardless of any role field sent by the client.
- **FR-03** The system shall authenticate users and issue a signed JWT that expires after one hour. Passwords shall be stored as bcrypt hashes and excluded from normal user queries/responses.
- **FR-04** Protected API requests shall require a valid bearer token and a user that still exists. Administrator and department routes shall enforce their respective roles.
- **FR-05** The client shall retain the token and basic user data in browser local storage and clear them on logout. Logout is client-side; it does not revoke an already-issued JWT.

### Citizen complaint workflow

- **FR-06** An authenticated citizen shall submit a complaint with a supported category, non-empty description, and non-empty location. Categories: Pothole, Traffic Signal, Illegal Parking, Road Blockage, Traffic Congestion, Street Lighting, Accident, Pedestrian Safety, Road Sign, Public Transport, Other.
- **FR-07** A complaint shall be associated with its submitting user and receive defaults: status `Submitted`, priority `Medium`, department status `Not Assigned`, and AI prediction status `Not Requested`.
- **FR-08** The citizen may attach one JPEG or PNG image up to 10 MB. The server shall store it under a generated name and expose a URL under `/uploads`.
- **FR-09** When an image is attached, the backend shall call the configured DL prediction endpoint (default `http://127.0.0.1:8000/predict`) with a 30 second timeout. Success, failure, or non-use shall be represented by AI status and available prediction fields; inability to obtain a prediction shall not prevent complaint creation.
- **FR-10** A citizen shall list only their own complaints, newest first, and retrieve details only for a complaint they own. Invalid IDs shall return 400; unavailable or non-owned records shall return 404.
- **FR-11** Complaint description shall be at most 2,000 characters and location at most 200 characters. Progress messages shall be at most 1,000 characters.

### Administration and department handling

- **FR-12** An administrator shall list all complaints, including reporter name/email and progress authors, without exposing passwords.
- **FR-13** An administrator shall create a department account with name, email, password (at least 8 characters), and department name. Duplicate email shall be rejected.
- **FR-14** An administrator shall assign or reassign a complaint to an existing department account. Assignment shall update department and complaint statuses and append an audit/progress entry.
- **FR-15** An administrator shall update complaint status from the supported values: Submitted, Under Review, Assigned to Department, Accepted by Department, In Progress, Work in Progress, Work Completed, Resolved, Rejected. Priority may be Low, Medium, or High. Status changes shall append a progress entry.
- **FR-16** An administrator shall view total complaint count and counts grouped by status.
- **FR-17** A department user shall list complaints assigned to the user's department, accept a complaint only while its department status is `Assigned`, and post progress only after acceptance. Progress may move the department status to Work in Progress or Work Completed.
- **FR-18** Department users shall only read or update records assigned to their own department.

## 4. External interfaces

| Interface | Contract |
|---|---|
| Web client to API | JSON over HTTP; multipart form data for complaint images; API base in client currently `http://localhost:5050/api`. |
| REST API | `/api/auth`, `/api/complaints`, `/api/admin`, `/api/department`; health at `GET /api/health`. Protected routes use `Authorization: Bearer <JWT>`. |
| Backend to DL API | `POST /predict`, multipart field `file`; expects `{success:true,prediction:{category,confidence,probabilities}}`. |
| Persistence | MongoDB via Mongoose. `User` and `Complaint` are the principal collections. |
| Image delivery | Static files served by backend at `/uploads`, with `X-Content-Type-Options: nosniff`. |

## 5. Data requirements

**User:** name (≤100), normalized unique email, bcrypt password hash (≥8 characters), role (`citizen`, `admin`, `department`), optional department, timestamps.

**Complaint:** owner reference, category, description (≤2,000), location (≤200), optional image URL, AI prediction status/category/confidence/probabilities, complaint status, assigned department, department status, progress update entries (actor, role, message, status, timestamp), priority, timestamps.

## 6. Non-functional requirements

- **NFR-01 Security:** use bcrypt password hashing, signed expiring JWTs, role checks, owner/department scoping, server-side input validation, and environment-based secrets.
- **NFR-02 Privacy:** citizens shall not access another citizen's complaint; passwords shall not appear in API responses; login errors shall not distinguish unknown email from wrong password.
- **NFR-03 Availability / dependency handling:** an unavailable DL service shall result in an AI status of `Failed` while allowing complaint submission. MongoDB is required for backend startup.
- **NFR-04 Usability:** the React client shall present role-specific dashboards and clear submission/authentication feedback.
- **NFR-05 Maintainability:** client, API, and inference service are separate deployable components; API/model behavior has automated test suites in the repository.
- **NFR-06 Deployment:** services are containerized; Docker Compose and Kubernetes manifests are provided. MongoDB credentials and JWT secret must be configured outside source control.
- **NFR-07 Performance:** image size is limited to 10 MB and the backend waits up to 30 seconds for a prediction. No response-time or concurrent-user service level is specified.

## 7. Constraints, assumptions, and exclusions

- MongoDB connectivity and a valid `JWT_SECRET` are required for normal backend operation.
- The DL API requires a compatible ResNet18 checkpoint at its configured model path to start successfully.
- The DL classifier's supported display classes are Road Damage, Normal Road, and Pothole. Its output is advisory; the repository does not establish production accuracy.
- The current deployment documentation describes local Docker Desktop Kubernetes, not a public cloud service.
- No pagination, server-side complaint filtering, email notification, token revocation, or service-level targets are specified as delivered features.

## 8. Acceptance basis

Requirements are accepted when the relevant role can complete the described API/UI workflow, authorization boundaries hold, validation errors are controlled, persisted values can be retrieved by authorized users, and AI failure does not block image complaint submission. Execution evidence belongs in the STP and test-results log.
