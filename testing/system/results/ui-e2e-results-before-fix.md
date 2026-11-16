# System test run: ui-e2e (first run, before the BUG-007/BUG-008 fixes)

2026-11-16T18:30:13.753Z · 14/16 passed · Chrome (headless), 1366×900 and 375×812

| ID | STP case | Test | Status | Observed result | Screenshot |
|---|---|---|---|---|---|
| UI-01 | TC42 | Sign-in page loads | Pass | Login and Register tabs, e-mail and password fields shown | [UI-01-login.png](../screenshots/UI-01-login.png) |
| UI-02 | TC42, TC-AUTH-01 | Citizen registers through the UI | Pass | "Registration successful! Please log in." shown | [UI-02-registered.png](../screenshots/UI-02-registered.png) |
| UI-03 | TC-AUTH-08, NFR-ACC-01 | Wrong password shows an accessible error | Pass | role="alert": "Invalid email or password" | [UI-03-login-error.png](../screenshots/UI-03-login-error.png) |
| UI-04 | TC42, TC-UI-01 | Citizen signs in and sees the citizen dashboard | Pass | Citizen dashboard with complaint form and My complaints | [UI-04-citizen-dashboard.png](../screenshots/UI-04-citizen-dashboard.png) |
| UI-05 | TC-UI-03 | Client rejects a GIF before upload | Pass | Validation message shown; no preview | [UI-05-gif-rejected.png](../screenshots/UI-05-gif-rejected.png) |
| UI-06 | TC43, TC-CMP-06, TC-AI-01 | Citizen submits a complaint with a photo; AI analysis appears | Pass | "Complaint submitted! AI prediction: Road Damage (44.0% confidence)."; card shows Submitted; AI road analysis · Prediction: Road Damage · Confidence: 44.0% · AI assistance only; verify the road condition manually. | [UI-06-complaint-submitted.png](../screenshots/UI-06-complaint-submitted.png) |
| UI-07 | TC44, FR-AUTH-08 | Logout clears the session; Back and reload stay on sign-in | Pass | token and user removed from localStorage; Back leaves the single-page app; re-opening and reloading the app shows sign-in | [UI-07-logged-out.png](../screenshots/UI-07-logged-out.png) |
| UI-08 | TC45, TC-UI-01, TC-ADM-04/07 | Admin sets priority High and assigns Roads & Maintenance | Pass | Card shows Assigned to Department, Roads & Maintenance, Priority High; AI analysis visible | [UI-08-admin-assigned.png](../screenshots/UI-08-admin-assigned.png) |
| UI-08b | UI-04, TC-ADM-01 | Admin card still shows the reporter after an update | Fail | reporter shown as "Unknown" after the update (correct after a page reload) | [before-fix/UI-08b-admin-reporter-unknown.png](../screenshots/before-fix/UI-08b-admin-reporter-unknown.png) |
| UI-09 | TC-DEP-02/05, TC-UI-01 | Department accepts, posts progress and marks work completed | Pass | Accepted → Work in Progress → Work Completed; notices shown; completion note shown | [UI-09-department-completed.png](../screenshots/UI-09-department-completed.png) |
| UI-10 | TC45, TC-ADM-09 | Admin verifies the work and sets Resolved | Pass | Status badge Resolved; statistics refreshed | [UI-10-admin-resolved.png](../screenshots/UI-10-admin-resolved.png) |
| UI-11 | TC-UI-04 | Citizen sees the complaint as Resolved | Pass | Card status Resolved | [UI-11-citizen-resolved.png](../screenshots/UI-11-citizen-resolved.png) |
| UI-12 | UI-03, TC-UI-04 | Citizen dashboard shows the progress history and assigned department | Fail | history shown: false, department shown: false (API returns both) | [before-fix/UI-12-citizen-no-history.png](../screenshots/before-fix/UI-12-citizen-no-history.png) |
| UI-13 | TC46 | Tampered token: user is returned to sign-in | Pass | Returned to sign-in | [UI-13-tampered-token.png](../screenshots/UI-13-tampered-token.png) |
| UI-14 | UI-06, TC-UI-05 | Mobile width (375 px): no horizontal scrolling | Pass | sign-in and citizen dashboard fit 375 px (scrollWidth 375) | [UI-14-mobile-dashboard.png](../screenshots/UI-14-mobile-dashboard.png) |
| UI-15 | NFR-ACC-01 | Sign-in form can be completed with the keyboard only | Pass | Tab from e-mail reaches password; Enter submits; dashboard opens | none |
