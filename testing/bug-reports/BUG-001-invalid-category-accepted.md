# BUG-001: Server accepts any complaint category

- **Severity:** Medium (data quality; breaks reporting by category and the planned DL/QML category link)
- **Test case:** TC20 (automated: `testing/automated/complaints.test.js`)
- **Environment:** `main` @ `1f5efb7`, `server/routes/complaintRoutes.js`, `server/models/Complaint.js`
- **Found by:** code review. The backend's own test `server/tests/complaint.test.js › "rejects an invalid complaint category"` expects 400, so that existing test should already be failing.
- **Status:** Open — confirm by running TC20

## Description
`POST /api/complaints` only checks that `category` is a non-empty string. The `Complaint` schema has no `enum` for `category`, so any text is stored. The React dropdown limits choices in the UI, but anyone calling the API directly (Postman, curl, a modified page) can store arbitrary categories.

## Steps to reproduce
1. Log in as a citizen and copy the token.
2. `POST http://localhost:5050/api/complaints`
   ```json
   { "category": "Not A Valid Category", "description": "test", "location": "MG Road" }
   ```
   with header `Authorization: Bearer <token>`.

## Expected behaviour
`400` with a message such as "Invalid complaint category"; nothing saved.

## Actual behaviour (predicted from code)
`201 Complaint submitted successfully`, complaint saved with category "Not A Valid Category".

## Screenshot / error message
To be attached after running TC20 (`testing/automated/latest-results.md` shows `Expected: 400; Received: 201` if confirmed).

## Suggested fix (for the backend owner)
Keep one list of allowed categories — the 11 values in `client/src/Dashboard.jsx` — and either add `enum` to `category` in `Complaint.js` and return 400 on `ValidationError`, or check `allowedCategories.includes(category)` in the route (same style as `allowedStatuses` in `adminRoutes.js`). TC20b checks that all 11 UI values still work after the fix.

## Re-test
Pending.
