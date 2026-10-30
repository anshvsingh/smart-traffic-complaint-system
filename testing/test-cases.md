# Test Cases — Smart Traffic Complaint and Monitoring System

Owner: Avyukt (QA) · Based on the code in `main` at commit `1f5efb7` · Last updated: 30 Oct 2026

**How to read this file**

- Every case below tests something that is **actually implemented** in `server/` (routes in `authRoutes.js`, `complaintRoutes.js`, `adminRoutes.js`). Features that are planned but not built are listed at the end and are not tested.
- `Auto` = the automated test with the same ID in `testing/automated/` (run with `bash testing/run-tests.sh`). `Manual` = run by hand with Postman/Thunder Client or the React UI.
- `STP` = the matching case in our submitted test plan (`docs/Smart_Traffic_Test_Plan.pdf`).
- **Actual result** and **Status** are filled in only after the test is executed (rule 5.4 of the STP: unexecuted cases stay *Pending / Not Run*). Results of each run go in `test-results.md`.
- **Code-review note**: what reading the code predicts. ⚠️ = the code suggests this case will **fail**; see the linked bug report.

API base URL for manual tests: `http://localhost:5050/api`

---

## 1. Authentication

| Test ID | Test case | Steps / input | Expected result | Actual result | Status | Ref | Code-review note |
|---|---|---|---|---|---|---|---|
| TC01 | Register valid user | `POST /auth/register` `{name, email, password(≥8)}` | **201**, "Registration successful", role `citizen`, no password in response | To be filled | Pending | Auto · STP TC-01 | Expected to pass |
| TC02 | Register duplicate email | Register `dup@example.com`, then `DUP@Example.com` | **409** "An account with this email already exists"; only one user stored | To be filled | Pending | Auto · STP TC-02 | Expected to pass (email lower-cased + unique index) |
| TC03 | Login valid user | `POST /auth/login` correct email/password, then call `GET /complaints` with the token | **200** "Login successful" + JWT; token opens protected route | To be filled | Pending | Auto · STP TC-03 (login part) | Expected to pass; token expires after 1 h |
| TC07 | Login with wrong password | Correct email, wrong password | **401** "Invalid email or password", no token | To be filled | Pending | Auto · STP TC-04 | Expected to pass |
| TC08 | Login with unknown email | Email that was never registered | **401** with the *same* message as TC07 (no account enumeration) | To be filled | Pending | Auto · STP TC-04 | Expected to pass |
| TC08b | Login with missing fields / operator objects | `{}`, missing password, `{"email":{"$gt":""}}` | **400**, no login | To be filled | Pending | Auto · STP SEC-06 | Expected to pass (`typeof` checks) |
| TC09 | Registration with missing fields | Missing name / email / password, blank name, password < 8 chars | **400** for each, no user created | To be filled | Pending | Auto · STP SEC-05 | Expected to pass |
| TC13 | Client tries to register as admin | Register with `"role": "admin"` | **201** but stored role is `citizen` | To be filled | Pending | Auto | Expected to pass |
| TC14 | Password storage | Register, inspect DB record, inspect login response | Stored as bcrypt hash (`$2…`), never returned by the API | To be filled | Pending | Auto · STP SEC-04 | Expected to pass (cost 12) |
| TC15 | Invalid email format | Register with `"email": "not-an-email"` | **400** validation error | To be filled | Pending | Auto | ⚠️ No format check — likely **201** · [BUG-004](bug-reports/BUG-004-email-format-not-validated.md) |
| TC16 | Over-long name | Register with a 101-character name | **400** controlled validation error | To be filled | Pending | Auto · STP SEC-05 | ⚠️ Mongoose `maxlength` error not handled — likely **500** · [BUG-003](bug-reports/BUG-003-long-name-returns-500.md) |

## 2. Protected routes / tokens

| Test ID | Test case | Steps / input | Expected result | Actual result | Status | Ref | Code-review note |
|---|---|---|---|---|---|---|---|
| TC05 | Access protected route without token | `GET /complaints` with no `Authorization` header | **401**, no complaint data | To be filled | Pending | Auto · STP SEC-01 | Expected to pass |
| TC10 | Access with an invalid token | `Bearer not-a-jwt`, `Bearer ` (empty), `Token abc` | **401** | To be filled | Pending | Auto | Expected to pass |
| TC11 | Token signed with another secret | JWT with correct shape but wrong signing key | **401** | To be filled | Pending | Auto | Expected to pass |
| TC12 | Expired token | JWT whose `exp` is in the past | **401** "Invalid or expired authentication" | To be filled | Pending | Auto | Expected to pass |
| TC12b | Token of a deleted user | Valid token, then delete the user | **401** | To be filled | Pending | Auto | Expected to pass (`protect` reloads the user) |

## 3. Complaints (citizen)

| Test ID | Test case | Steps / input | Expected result | Actual result | Status | Ref | Code-review note |
|---|---|---|---|---|---|---|---|
| TC04 | Submit valid complaint | `POST /complaints` `{category:"Pothole", description, location}` with citizen token | **201** "Complaint submitted successfully"; has `_id`, `createdAt`, owner = citizen | To be filled | Pending | Auto · STP TC-05 | Expected to pass |
| TC21 | Default complaint status | Inspect the complaint from TC04 | `status` = **"Submitted"** | To be filled | Pending | Auto · STP TC-05 | Expected to pass |
| TC22 | Default priority | Inspect the complaint from TC04 | `priority` = **"Medium"** | To be filled | Pending | Auto | Expected to pass |
| TC19 | Missing complaint fields | Omit category / description / location, or send blanks | **400** "Category, description, and location are required"; nothing saved | To be filled | Pending | Auto · STP TC-06 | Expected to pass |
| TC20 | Invalid complaint category | `category: "Not A Valid Category"` | **400**; nothing saved | To be filled | Pending | Auto | ⚠️ No category list on the server — likely **201** · [BUG-001](bug-reports/BUG-001-invalid-category-accepted.md) |
| TC20b | All UI categories accepted | Each of the 11 values in the dashboard dropdown | **201** for each | To be filled | Pending | Auto | Expected to pass; guards the BUG-001 fix |
| TC25 | Over-long description | Description of 2,001 characters | **400** controlled validation error | To be filled | Pending | Auto · STP SEC-05 | ⚠️ Mongoose `maxlength: 2000` error not handled — likely **500** · [BUG-002](bug-reports/BUG-002-long-description-returns-500.md) |
| TC26 | Citizen cannot set status/priority/owner | Send `status:"Resolved"`, `priority:"High"`, `user:<other id>` with the complaint | Extra fields ignored: Submitted / Medium / owner = sender | To be filled | Pending | Auto | Expected to pass |
| TC27 | Query-operator injection | `category: {"$gt": ""}` | **400** | To be filled | Pending | Auto · STP SEC-06 | Expected to pass |
| TC17 | Retrieve my complaints | Citizen A has 2, citizen B has 1; A calls `GET /complaints` | **200**, `count: 2`, only A's complaints, newest first | To be filled | Pending | Auto · STP TC-07 | Expected to pass |
| TC18 | Retrieve one complaint | `GET /complaints/:id` for A's own complaint | **200** with that complaint | To be filled | Pending | Auto | Expected to pass |
| TC23 | Citizen opens another citizen's complaint | A requests B's complaint ID | **404** "Complaint not found", no data leaked; B can still open it | To be filled | Pending | Auto · STP TC-08, SEC-02 | Expected to pass (privacy-preserving 404) |
| TC24 | Invalid complaint ID | `GET /complaints/not-an-id`; and a valid-looking ID that doesn't exist | **400** "Invalid complaint ID"; **404** for the unknown ID | To be filled | Pending | Auto | Expected to pass |

## 4. Admin

> There is no API to create an admin. For **manual** tests: register normally, then in MongoDB Atlas run
> `db.users.updateOne({ email: "admin@test.com" }, { $set: { role: "admin" } })` on a **test** database.
> The automated suite creates its admin directly in the in-memory database.

| Test ID | Test case | Steps / input | Expected result | Actual result | Status | Ref | Code-review note |
|---|---|---|---|---|---|---|---|
| TC28 | Admin login | Log in with the admin account; call `GET /admin/complaints` | **200**, `user.role = "admin"`; admin route opens | To be filled | Pending | Auto | Expected to pass |
| TC06 | Citizen accesses admin route | Citizen token on `GET /admin/complaints`, `GET /admin/dashboard`, `PATCH /admin/complaints/:id` | **403** "Administrator access required" on all three | To be filled | Pending | Auto · STP TC-09, SEC-03 | Expected to pass |
| TC37 | Admin route without token | No `Authorization` header | **401** | To be filled | Pending | Auto | Expected to pass |
| TC38 | Forged role claim | Citizen's token re-signed with `role: "admin"` in the payload | **403** (role is read from the DB, not the token) | To be filled | Pending | Auto | Expected to pass |
| TC29 | Admin retrieves all complaints | Two citizens' complaints exist | **200**, `count: 2`, each with `user.name`/`user.email`, never the password | To be filled | Pending | Auto | Expected to pass |
| TC30 | Dashboard counts | Seed 2 Submitted + 1 Resolved | `total: 3`, `byStatus: {Submitted: 2, Resolved: 1}` | To be filled | Pending | Auto · STP TC-14 | Expected to pass |
| TC31 | Update status | `PATCH /admin/complaints/:id` `{status:"In Progress"}` | **200**, saved in DB, visible to the citizen | To be filled | Pending | Auto · STP TC-12 | Expected to pass |
| TC32 | Update priority | `{priority:"High"}` | **200**, saved in DB | To be filled | Pending | Auto · STP TC-11 (priority part) | Expected to pass |
| TC33 | Invalid status | `{status:"Closed"}` | **400** "Invalid complaint status"; old status kept | To be filled | Pending | Auto · STP TC-13, SEC-08 | Expected to pass |
| TC34 | Invalid priority | `{priority:"Urgent"}` | **400**; old priority kept | To be filled | Pending | Auto | Expected to pass |
| TC35 | Empty update | Body without status or priority | **400** "Provide a status or priority to update" | To be filled | Pending | Auto | Expected to pass |
| TC36 | Invalid / unknown ID on update | `not-an-id`; unknown valid ID | **400**; **404** | To be filled | Pending | Auto | Expected to pass |
| TC39 | Citizen tries to update | Citizen token on PATCH | **403**; complaint unchanged | To be filled | Pending | Auto · STP SEC-03 | Expected to pass |

## 5. General / error handling

| Test ID | Test case | Steps / input | Expected result | Actual result | Status | Ref | Code-review note |
|---|---|---|---|---|---|---|---|
| TC40 | Malformed JSON body | `POST /auth/login` with body `{"email": "a@example.com", "password": ` | **400** JSON error, no stack trace or file paths | To be filled | Pending | Auto · STP TC-18, SEC-07 | ⚠️ No error handler in `app.js` — Express default HTML page with stack trace (outside production) · [BUG-005](bug-reports/BUG-005-malformed-json-leaks-stack-trace.md) |
| TC41 | Health check / unknown route | `GET /api/health`; `GET /api/does-not-exist` | **200** `{status:"ok"}`; **404** "Route not found" (JSON) | To be filled | Pending | Auto | Expected to pass |

## 6. UI checks (manual, React app on `http://localhost:5173`)

| Test ID | Test case | Steps | Expected result | Actual result | Status | Ref |
|---|---|---|---|---|---|---|
| TC42 | Register → login → dashboard | Register in the UI, log in | "Registration successful! Please log in.", then citizen dashboard | To be filled | Pending | Manual · STP TC-01/03 |
| TC43 | Submit complaint from UI | Fill category, location, description; submit | Success message; complaint appears in "my complaints" with status Submitted | To be filled | Pending | Manual · STP TC-05 |
| TC44 | Logout | Click logout, press browser Back | Login screen; dashboard data not shown | To be filled | Pending | Manual · STP TC-03 (logout part) |
| TC45 | Admin dashboard | Log in as admin, change a status and a priority | Values update and counters refresh | To be filled | Pending | Manual · STP TC-11/12/14 |
| TC46 | Session expiry | Edit the stored token in DevTools → localStorage, reload | User is sent back to login | To be filled | Pending | Manual |
| TC47 | Browser compatibility | Repeat TC42–TC45 in Chrome and Firefox | No blocking differences | To be filled | Pending | Manual · STP TC-16 |

## 7. In the test plan but **not implemented yet** (not tested)

| STP case | Feature | Current state in code |
|---|---|---|
| TC-03 (server side) | Logout invalidating the token | Logout only clears `localStorage`; the JWT stays valid until it expires (1 h). Noted, not a bug unless the team decides tokens must be revoked. |
| TC-10 | Admin filtering by status/category | `GET /admin/complaints` has no query filters (UI may filter client-side). |
| TC-11 (assignment) | Assign complaint to an officer | No assignment field in `Complaint` model. |
| TC-15 | Performance with 1,000 complaints | Can be run later; no pagination exists, so the list returns everything. |
| TC-17 | Usability with 5 users | Needs real participants. |
| — | Photo upload / DL prediction in complaint flow | `dl/src/api.py` exists but is not called by the backend or UI yet. |
