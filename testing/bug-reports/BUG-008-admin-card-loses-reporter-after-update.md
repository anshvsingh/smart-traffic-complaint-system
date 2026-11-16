# BUG-008: Admin complaint card shows reporter as "Unknown" after an update

- **Severity:** Low
- **Test case:** UI-08b (system test), SRS UI-04 / FR-ADM-01
- **Environment:** branch `docs/update-srs-sad-stp-uml` @ `f2ff527`, macOS, Node 24, Chrome (headless), local stack
- **Found by:** system test run, 17 Nov 2026
- **Status:** Verified (fixed in commit `c4ca873`, re-tested 17 Nov 2026)

## Description
After the administrator changes the status or priority of a complaint, or assigns it to a department, the card's *Reported by* field changes from the citizen's name and e-mail to "Unknown / N/A". After a page reload it is correct again.

Cause: `PATCH /api/admin/complaints/:id` and `PATCH /api/admin/complaints/:id/assign` (`server/routes/adminRoutes.js`, lines 191 and 280) return the saved complaint without populating `user`, so `user` is only an ID. `AdminDashboard.jsx` replaces the card with that response.

## Steps to reproduce
1. Admin signs in; a complaint shows the reporter's name and e-mail.
2. Change its priority, or assign a department.

## Expected behaviour
The reporter's name and e-mail stay visible.

## Actual behaviour
"Unknown" and "N/A" until the page is reloaded. See `../system/screenshots/UI-08b-admin-reporter-after-update.png`.

## Suggested fix
Backend: `await complaint.populate("user", "name email")` (and `progressUpdates.updatedBy`) before responding. Or frontend: keep the existing `user` object when merging the updated complaint.

## Re-test
- **Fix:** commit `c4ca873` on branch `docs/update-srs-sad-stp-uml` (PR #20).
- **Regression tests added:** `server/tests/adminWorkflow.test.js` (2 tests); they pass.
- **System re-test, 17 Nov 2026:** `node testing/system/ui-e2e.cjs` step UI-08b **Pass**; the full browser suite passes 16/16. Live API 39/39, QA suite 45/45 and DL-outage 2/2 also re-run with no regressions.
- Re-confirmed with the Playwright suite that replaced the Puppeteer script (`cd testing/system && npx playwright test`): UI-08b **Pass**, 16/16.
- Evidence: before `../system/screenshots/before-fix/`, after `../system/screenshots/`.
