# System test run: system-api

2026-11-16T18:45:09.145Z · 39/39 passed

| ID | STP case | Test | Status | Observed result | Time (ms) |
|---|---|---|---|---|---|
| SYS-01 | NFR-REL-02 | Backend health endpoint responds | Pass | 200 ok in 24 ms | 25 |
| SYS-02 | TC-DL-01 | DL service health reports the model is loaded | Pass | model_loaded=true on mps | 2 |
| SYS-03 | TC-AUTH-11 | Seeded department accounts can sign in | Pass | roads and police accounts: role department | 561 |
| SYS-04 | — | Administrator can sign in | Pass | role admin | 270 |
| SYS-05 | TC-AUTH-01/06 | Citizen registers; a client-supplied admin role is ignored | Pass | 201, role citizen, no password in response | 543 |
| SYS-06 | TC-AUTH-02 | Duplicate e-mail with different case is rejected | Pass | 409 | 2 |
| SYS-07 | TC-AUTH-03/04 | Invalid registration input is rejected | Pass | invalid e-mail, 7-char password, 101-char name: all 400 | 4 |
| SYS-08 | TC-AUTH-07 | Citizen logs in and receives a 1-hour JWT | Pass | 200, exp - iat = 3600 s | 539 |
| SYS-09 | TC-AUTH-08 | Wrong password and unknown e-mail give the same 401 | Pass | both 401 "Invalid email or password" | 262 |
| SYS-10 | TC-AUTH-09 | NoSQL operator injection in login is rejected | Pass | 400, no token | 1 |
| SYS-11 | TC-SEC-01/02 | Missing, malformed and wrongly signed tokens are rejected | Pass | 401 for all three | 2 |
| SYS-12 | TC-SEC-04 | Citizen is refused on admin and department routes | Pass | 403 on both | 3 |
| SYS-13 | TC-SEC-05 | A validly signed token claiming role=admin for a citizen is refused | Pass | 403: role is read from the database | 1 |
| SYS-14 | TC-CMP-06, TC-AI-01 | Complaint with JPEG photo is stored and classified by the DL service | Pass | 201 in 691 ms; AI Completed: Road Damage (44.0 %); Submitted/Medium/Not Assigned | 692 |
| SYS-15 | TC-SEC-08 | Uploaded image is served with nosniff | Pass | 200 image/jpeg, nosniff | 3 |
| SYS-16 | TC-CMP-06 | PNG with a misleading .html file name is stored as .png | Pass | 201, stored as 45985615-918e-4240-b361-61e3aa4f4559.png | 28 |
| SYS-17 | TC-CMP-01 | Complaint without a photo: AI Not Requested | Pass | 201, AI Not Requested | 3 |
| SYS-18 | TC-CMP-03/04/05 | Invalid complaint input is rejected | Pass | invalid category, blank location, 2,001-char description: all 400 | 7 |
| SYS-19 | TC-CMP-07 | GIF and over-10 MB images are rejected | Pass | GIF 400 "Only JPG and PNG images are allowed"; 10 MB + 1 byte 400 "Image must be 10 MB or smaller" | 115 |
| SYS-20 | TC-CMP-09 | Each citizen lists only their own complaints, newest first | Pass | A sees 3, B sees 1; newest first | 19 |
| SYS-21 | TC-CMP-10/11 | Citizen cannot open another citizen's complaint | Pass | other's 404, own 200, malformed ID 400 | 7 |
| SYS-22 | TC-DL-02..05 | DL service rejects invalid files | Pass | text 400, empty 400, > 10 MB 413, corrupted 400 | 92 |
| SYS-23 | TC-DL-06 | DL service classifies a PNG with three class probabilities | Pass | 200 in 16 ms: Road Damage | 16 |
| SYS-24 | TC-ADM-01 | Admin sees all complaints with reporter details and no passwords | Pass | 17 complaints listed; reporter e-mail shown; no passwords | 12 |
| SYS-25 | TC-ADM-10 | Admin dashboard counts match the stored complaints | Pass | total 17, Submitted 10 | 34 |
| SYS-26 | TC-ADM-02/03 | Admin creates a department account; duplicate rejected | Pass | 201, new account can sign in as department; duplicate 409 | 553 |
| SYS-27 | TC-ADM-04, TC-ADM-07 | Admin assigns the complaint to Roads & Maintenance and sets priority High | Pass | Assigned to Department / Assigned; priority High | 18 |
| SYS-28 | TC-ADM-05, TC-ADM-06 | Reassignment is recorded; unknown department rejected | Pass | history: "Complaint reassigned from Traffic Police to Traffic Signal Department."; unknown department 404 | 7 |
| SYS-29 | TC-ADM-08 | Invalid status and priority values are rejected | Pass | 400 for each | 2 |
| SYS-30 | TC-DEP-01, TC-DEP-07 | Departments only see and act on their own complaints | Pass | Roads lists it, Police does not; Police accept 404 | 5 |
| SYS-31 | TC-DEP-04 | Progress before acceptance is rejected | Pass | 400 | 1 |
| SYS-32 | TC-DEP-02/03 | Department accepts once; second acceptance rejected | Pass | 200 Accepted by Department; repeat 400 | 4 |
| SYS-33 | TC-DEP-05/06 | Department posts progress and marks work completed | Pass | empty/Resolved 400; Work in Progress → Work Completed | 7 |
| SYS-34 | TC-DEP-08 | Department cannot resolve through the admin API | Pass | 403 | 1 |
| SYS-35 | TC-ADM-09 | Admin verifies and resolves | Pass | Resolved; department status Work Completed | 3 |
| SYS-36 | TC-UI-04 (API) | Citizen sees the resolved complaint with full history | Pass | Resolved, 5 history entries: admin → department → department → department → admin | 1 |
| SYS-37 | TC-SEC-06/07 | Malformed JSON and unknown routes return JSON errors | Pass | 400 "Malformed JSON in request body"; 404 "Route not found" | 3 |
| SYS-38 | CI-02 | CORS allows only the web client origin | Pass | client origin allowed; foreign origin not echoed | 1 |
| SYS-39 | NFR-PRF-01/02 | Response-time sample (20 requests each) | Pass | citizen list median 1 ms (p95 2); admin list median 3 ms; DL predict median 14 ms (p95 16) | 348 |
