# BUG-008: Admin complaint card shows reporter as "Unknown" after an update

- **Severity:** Low
- **Test case:** UI-08b (system test), SRS UI-04 / FR-ADM-01
- **Environment:** branch `docs/update-srs-sad-stp-uml` @ `f2ff527`, macOS, Node 24, Chrome (headless), local stack
- **Found by:** system test run, 17 Nov 2026
- **Status:** Open

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
Pending: `node testing/system/ui-e2e.cjs` step UI-08b.
