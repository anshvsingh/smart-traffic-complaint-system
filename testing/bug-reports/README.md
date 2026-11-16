# Bug reports

One file per defect. IDs are referenced from `../test-cases.md` and from test names in `../automated/` (e.g. `TC20 [BUG-001] ...`).

| ID | Title | Severity | Found by | Status |
|---|---|---|---|---|
| [BUG-001](BUG-001-invalid-category-accepted.md) | Server accepts any complaint category | Medium | Code review + existing test `server/tests/complaint.test.js` | Verified (TC20 passed, 16 Nov 2026) |
| [BUG-002](BUG-002-long-description-returns-500.md) | Description over 2,000 chars returns 500 instead of 400 | Low | Code review | Verified (TC25 passed, 16 Nov 2026) |
| [BUG-003](BUG-003-long-name-returns-500.md) | Name over 100 chars returns 500 instead of 400 | Low | Code review | Verified (TC16 passed, 16 Nov 2026) |
| [BUG-004](BUG-004-email-format-not-validated.md) | Registration accepts invalid email addresses | Low | Code review | Verified (TC15 passed, 16 Nov 2026) |
| [BUG-005](BUG-005-malformed-json-leaks-stack-trace.md) | Malformed JSON returns an HTML page with a stack trace | Medium (security) | Code review | Verified (TC40 passed, 16 Nov 2026) |
| [BUG-006](BUG-006-index-js-dead-duplicate-setup.md) | `index.js` re-registers CORS/routes after the 404 handler (dead code) | Low (maintainability) | Code review | Verified (index.js only bootstraps; full suite passed, 16 Nov 2026) |
| [BUG-007](BUG-007-citizen-dashboard-hides-progress-history.md) | Citizen dashboard does not show progress history or assigned department | Medium | System test UI-12 | Open |
| [BUG-008](BUG-008-admin-card-loses-reporter-after-update.md) | Admin card shows reporter as "Unknown" after an update | Low | System test UI-08b | Open |

**Status values:** Open → Fixed (by backend owner) → Verified (re-test passed, see `../test-results.md` regression section) → Closed.

Per team agreement, QA does **not** edit backend code. Each report has a *suggested fix* for the backend owner to decide on.

## Template

```
# BUG-XXX: <short title>
- Severity: Critical / High / Medium / Low
- Test case: TCxx
- Environment: branch + commit, OS, Node version
- Status: Open

## Description
## Steps to reproduce
## Expected behaviour
## Actual behaviour
## Screenshot / error message
## Suggested fix (for the backend owner)
## Re-test
```
