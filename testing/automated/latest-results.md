# Automated run 2026-11-16T18:47:08.219Z

45/45 passed.

| Test ID | Test case | Status | Actual result (first assertion message if failed) |
|---|---|---|---|
| TC01 | registers a new citizen | Pass | As expected |
| TC02 | rejects an already registered email (case-insensitive) | Pass | As expected |
| TC03 | logs in with valid credentials and the token opens a protected route | Pass | As expected |
| TC04 | creates a complaint with valid information | Pass | As expected |
| TC05 | denies access without a token | Pass | As expected |
| TC06 | a citizen is denied on every admin route | Pass | As expected |
| TC07 | rejects an incorrect password | Pass | As expected |
| TC08 | gives the same answer for an unknown email (no account enumeration) | Pass | As expected |
| TC08b | rejects missing login fields and query-operator objects | Pass | As expected |
| TC09 | rejects registration with missing or invalid fields | Pass | As expected |
| TC10 | denies access with a malformed token | Pass | As expected |
| TC11 | denies access with a token signed by a different secret | Pass | As expected |
| TC12 | denies access with an expired token | Pass | As expected |
| TC12b | denies access when the token's user no longer exists | Pass | As expected |
| TC13 | ignores a role supplied by the client (no self-promotion to admin) | Pass | As expected |
| TC14 | stores the password as a bcrypt hash and never returns it | Pass | As expected |
| TC15 | [BUG-004] rejects an email address with an invalid format | Pass | As expected |
| TC16 | [BUG-003] rejects an over-long name with a controlled 400 (not a 500) | Pass | As expected |
| TC17 | lists only the logged-in citizen's complaints, newest first | Pass | As expected |
| TC18 | retrieves an individual complaint the citizen owns | Pass | As expected |
| TC19 | rejects a complaint with missing fields and saves nothing | Pass | As expected |
| TC20 | [BUG-001] rejects a category that is not in the allowed list | Pass | As expected |
| TC20b | accepts every category offered by the citizen dashboard | Pass | As expected |
| TC21 | a new complaint gets the default status 'Submitted' | Pass | As expected |
| TC22 | a new complaint gets the default priority 'Medium' | Pass | As expected |
| TC23 | a citizen cannot read another citizen's complaint | Pass | As expected |
| TC24 | rejects an invalid complaint ID format | Pass | As expected |
| TC24b | returns 404 for a well-formed ID that does not exist | Pass | As expected |
| TC25 | [BUG-002] rejects an over-long description with a controlled 400 (not a 500) | Pass | As expected |
| TC26 | ignores status, priority and owner supplied by the citizen | Pass | As expected |
| TC27 | treats query-operator objects as invalid input | Pass | As expected |
| TC28 | an administrator can log in and receives role 'admin' | Pass | As expected |
| TC29 | retrieves all complaints with the citizen's name and email | Pass | As expected |
| TC30 | dashboard counts match the stored complaints | Pass | As expected |
| TC31 | updates a complaint's status | Pass | As expected |
| TC32 | updates a complaint's priority | Pass | As expected |
| TC33 | rejects a status outside the allowed list and keeps the old value | Pass | As expected |
| TC34 | rejects a priority outside the allowed list | Pass | As expected |
| TC35 | rejects an update with neither status nor priority | Pass | As expected |
| TC36 | handles invalid and unknown complaint IDs | Pass | As expected |
| TC37 | admin routes reject requests without a token | Pass | As expected |
| TC38 | a citizen token that CLAIMS role=admin is still denied (role comes from the database) | Pass | As expected |
| TC39 | a citizen cannot change status or priority | Pass | As expected |
| TC40 | [BUG-005] malformed JSON gets a controlled JSON 400 without a stack trace | Pass | As expected |
| TC41 | health check works and unknown routes return a JSON 404 | Pass | As expected |
