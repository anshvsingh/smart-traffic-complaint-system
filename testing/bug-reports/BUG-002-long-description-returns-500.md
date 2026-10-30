# BUG-002: Description over 2,000 characters returns 500 instead of 400

- **Severity:** Low (wrong status code + misleading message; no data corruption)
- **Test case:** TC25 · STP SEC-05 ("oversized fields → controlled 400")
- **Environment:** `main` @ `1f5efb7`, `server/routes/complaintRoutes.js` (POST `/`), `server/models/Complaint.js`
- **Found by:** code review
- **Status:** Open — confirm by running TC25

## Description
The schema sets `description.maxlength = 2000`, but the route does not check length. `Complaint.create()` throws a Mongoose `ValidationError`, which the generic `catch` turns into `500 "Unable to submit complaint"`. The client cannot tell that the input was the problem. (`location` has no length limit at all.)

## Steps to reproduce
1. Log in as a citizen.
2. `POST /api/complaints` with `description` = 2,001 × "x", plus a valid category and location.

## Expected behaviour
`400` with a clear message (e.g. "Description must be 2000 characters or fewer"); nothing saved.

## Actual behaviour (predicted from code)
`500 {"status":"error","message":"Unable to submit complaint"}` and a `Create complaint error: Complaint validation failed: description: ...` line in the server log.

## Suggested fix (for the backend owner)
Check the length in the route before `create`, or in the `catch` return 400 when `error.name === "ValidationError"`. Consider a `maxlength` for `location` too.

## Re-test
Pending.
