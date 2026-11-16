# BUG-007: Citizen dashboard does not show progress history or assigned department

- **Severity:** Medium
- **Test case:** UI-12 (system test), SRS UI-03, STP TC-UI-04
- **Environment:** branch `docs/update-srs-sad-stp-uml` @ `f2ff527`, macOS, Node 24, Chrome (headless), local stack
- **Found by:** system test run, 17 Nov 2026
- **Status:** Verified (fixed in commit `c4ca873`, re-tested 17 Nov 2026)

## Description
The README and SRS (UI-03) say a citizen can see the progress history of their complaint. The API returns it: `GET /api/complaints/:id` includes `progressUpdates` and `assignedDepartment` (verified by system test SYS-36, 5 entries). But `client/src/Dashboard.jsx` only renders the status badge, description, AI analysis, image, location and date. Department messages such as "Pothole filled and resurfaced." and the assigned department never appear for the citizen.

## Steps to reproduce
1. Citizen submits a complaint.
2. Admin assigns it to Roads & Maintenance; the department accepts, posts progress and marks work completed; admin resolves.
3. Citizen signs in and opens *My complaints*.

## Expected behaviour
The complaint card shows the assigned department and the progress history (who, what, when).

## Actual behaviour
Only the status badge changes to *Resolved*. No history or department is shown. See `../system/screenshots/UI-12-failure.png`.

## Suggested fix (for the frontend owner)
In `Dashboard.jsx`, render `complaint.assignedDepartment` and a timeline of `complaint.progressUpdates` (as `DepartmentDashboard.jsx` already does in its details modal).

## Re-test
- **Fix:** commit `c4ca873` on branch `docs/update-srs-sad-stp-uml` (PR #20).
- **Regression tests added:** `client/src/test/DashboardTracking.test.jsx` (3 tests); they pass.
- **System re-test, 17 Nov 2026:** `node testing/system/ui-e2e.cjs` step UI-12 **Pass**; the full browser suite passes 16/16. Live API 39/39, QA suite 45/45 and DL-outage 2/2 also re-run with no regressions.
- Re-confirmed with the Playwright suite that replaced the Puppeteer script (`cd testing/system && npx playwright test`): UI-12 **Pass**, 16/16.
- Evidence: before `../system/screenshots/before-fix/`, after `../system/screenshots/`.
