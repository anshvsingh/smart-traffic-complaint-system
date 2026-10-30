# BUG-005: Malformed JSON returns Express's HTML error page with a stack trace

- **Severity:** Medium (information disclosure — STP SEC-07; also inconsistent error format for the React client)
- **Test case:** TC40 · STP TC-18, SEC-07
- **Environment:** `main` @ `1f5efb7`, `server/app.js`
- **Found by:** code review
- **Status:** Open — confirm by running TC40

## Description
`app.js` uses `express.json()` but has no error-handling middleware (`(err, req, res, next) => …`). When the body is not valid JSON (or is larger than the 100 kb default), body-parser passes an error to Express's built-in handler. Unless `NODE_ENV=production`, that handler replies with an **HTML** page containing the full stack trace and file paths of the server. The 404 handler in `app.js` does not catch errors because it is not a 4-argument error handler.

## Steps to reproduce
```bash
curl -i -X POST http://localhost:5050/api/auth/login \
  -H "Content-Type: application/json" \
  --data '{"email": "a@example.com", "password": '
```

## Expected behaviour
`400 {"status":"error","message":"Invalid JSON body"}` — JSON, no internal details.

## Actual behaviour (predicted from code)
`400` with `Content-Type: text/html` and a `<pre>SyntaxError: Unexpected end of JSON input<br> &nbsp; &nbsp;at JSON.parse ... node_modules/body-parser/...</pre>` page.

## Suggested fix (for the backend owner)
Add at the very end of `app.js`:
```js
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    status: "error",
    message: status === 400 ? "Invalid JSON body" : status === 413 ? "Request body too large" : "Internal server error",
  });
});
```
and run with `NODE_ENV=production` when deployed.

## Re-test
Pending.
