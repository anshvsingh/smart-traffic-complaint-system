# BUG-003: Registration with a name over 100 characters returns 500 instead of 400

- **Severity:** Low
- **Test case:** TC16 · STP SEC-05
- **Environment:** `main` @ `1f5efb7`, `server/routes/authRoutes.js` (`/register`), `server/models/User.js`
- **Found by:** code review
- **Status:** Open — confirm by running TC16

## Description
`User.name` has `maxlength: 100`. The route does not check it, so `User.create()` throws a `ValidationError`. The `catch` only handles duplicate keys (`error.code === 11000`), so the user gets `500 "Unable to register account"`.

## Steps to reproduce
`POST /api/auth/register` with `{ "name": "<101 × x>", "email": "long@example.com", "password": "Password123" }`.

## Expected behaviour
`400` with a validation message.

## Actual behaviour (predicted from code)
`500 {"status":"error","message":"Unable to register account"}`.

## Suggested fix (for the backend owner)
Add `name.trim().length > 100` to the existing validation `if`, or map `ValidationError` to 400 in the `catch`.

## Re-test
Pending.
