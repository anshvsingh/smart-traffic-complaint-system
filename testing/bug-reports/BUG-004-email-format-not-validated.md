# BUG-004: Registration accepts invalid email addresses

- **Severity:** Low
- **Test case:** TC15
- **Environment:** `main` @ `1f5efb7`, `server/routes/authRoutes.js` (`/register`)
- **Found by:** code review
- **Status:** Open — confirm by running TC15

## Description
The error message says "Provide a name, valid email, and password…", but the only email check is "non-empty string". `not-an-email`, `a@`, `@@` are all accepted and stored. The React form uses `<input type="email">`, so the browser blocks this in the UI, but the API itself does not validate — direct API calls get through.

## Steps to reproduce
`POST /api/auth/register` with `{ "name": "Test", "email": "not-an-email", "password": "Password123" }`.

## Expected behaviour
`400` validation error.

## Actual behaviour (predicted from code)
`201 Registration successful`.

## Suggested fix (for the backend owner)
A simple pattern check before saving, e.g. `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)`, or `match:` on the schema field.

## Re-test
Pending.
