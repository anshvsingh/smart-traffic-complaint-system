# Bug reports

One file per defect. IDs are referenced from `../test-cases.md` and from test names in `../automated/` (e.g. `TC20 [BUG-001] ...`).

| ID | Title | Severity | Found by | Status |
|---|---|---|---|---|
| [BUG-001](BUG-001-invalid-category-accepted.md) | Server accepts any complaint category | Medium | Code review + existing test `server/tests/complaint.test.js` | Open — confirm with TC20 |
| [BUG-002](BUG-002-long-description-returns-500.md) | Description over 2,000 chars returns 500 instead of 400 | Low | Code review | Open — confirm with TC25 |
| [BUG-003](BUG-003-long-name-returns-500.md) | Name over 100 chars returns 500 instead of 400 | Low | Code review | Open — confirm with TC16 |
| [BUG-004](BUG-004-email-format-not-validated.md) | Registration accepts invalid email addresses | Low | Code review | Open — confirm with TC15 |
| [BUG-005](BUG-005-malformed-json-leaks-stack-trace.md) | Malformed JSON returns an HTML page with a stack trace | Medium (security) | Code review | Open — confirm with TC40 |
| [BUG-006](BUG-006-index-js-dead-duplicate-setup.md) | `index.js` re-registers CORS/routes after the 404 handler (dead code) | Low (maintainability) | Code review | Open |

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
