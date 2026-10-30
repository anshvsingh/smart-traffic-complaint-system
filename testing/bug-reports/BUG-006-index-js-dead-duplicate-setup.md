# BUG-006: `index.js` re-registers CORS, JSON parser and routes after `app.js` already did (dead code)

- **Severity:** Low (no user-visible failure today; risk of confusion and wrong fixes later)
- **Test case:** none (code review only)
- **Environment:** `main` @ `1f5efb7`, `server/index.js`
- **Found by:** code review
- **Status:** Open

## Description
`server/index.js` imports the fully configured `app` from `app.js` (which already has CORS restricted to `http://localhost:5173`, `express.json()`, all three routers, `/`, `/api/health` and the 404 handler) and then adds **again**: `express.json()`, an **unrestricted** `cors()`, the auth and complaint routers, `/`, `/api/health` and another 404 handler. Because `app.js`'s 404 handler is registered first and ends every unmatched request, nothing added in `index.js` ever runs. `dotenv` is also loaded twice.

Today this is harmless, but if someone "fixes CORS" or adds a route in `index.js` it will silently have no effect; and if the order ever changes, the open `cors()` would replace the restricted one.

## Steps to reproduce
Read `server/index.js` lines 1–40 next to `server/app.js`. (Optional check: add `console.log` inside one of the `index.js` handlers — it never prints.)

## Expected behaviour
`index.js` only loads env, connects to MongoDB and calls `app.listen`.

## Actual behaviour
Duplicate, unreachable middleware and routes in `index.js`.

## Suggested fix (for the backend owner)
Delete the duplicated lines in `index.js` (keep `require("dotenv")…`, `app`, `connectDB`, `PORT`, `startServer`). Also `server/middleware/auth.js` (`authenticateToken`) is not used by any route — remove or document it so tests target the right middleware.

## Re-test
After the change, run `npm test` in `server/` and `bash testing/run-tests.sh` (regression).
