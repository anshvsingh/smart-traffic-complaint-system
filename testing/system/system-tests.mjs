// TrafficCare live system tests.
// Runs end-to-end scenarios over HTTP against the RUNNING stack:
// React-facing backend API + MongoDB + DL inference service.
//
// Prerequisites: backend, DL service and a TEST MongoDB are running, and the
// admin account exists (node testing/system/create-admin.js).
//
//   node testing/system/system-tests.mjs              # main suite
//   node testing/system/system-tests.mjs --outage     # run with the DL service STOPPED
//
// Configuration (environment or server/.env):
//   API_URL  (default http://localhost:5050/api)   DL_URL (default http://localhost:8000)
//   SYSTEM_TEST_ADMIN_EMAIL / SYSTEM_TEST_ADMIN_PASSWORD, DEPT_ROADS_PASSWORD,
//   DEPT_POLICE_PASSWORD, JWT_SECRET (only for the forged-token case)
//
// Writes testing/system/results/<suite>-results.json and .md
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const envFile = path.join(root, "server", ".env");
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fileEnv[m[1]] = m[2];
  }
}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d;
const API = env("API_URL", "http://localhost:5050/api");
const DL = env("DL_URL", (env("DL_API_URL", "http://localhost:8000/predict")).replace(/\/predict$/, ""));
const ORIGIN = API.replace(/\/api$/, "");
const OUTAGE = process.argv.includes("--outage");

const JPEG = fs.readFileSync(path.join(here, "fixtures", "road.jpg"));
const PNG = fs.readFileSync(path.join(here, "fixtures", "road.png"));
const run = crypto.randomBytes(3).toString("hex");
const results = [];
const ctx = {};

async function call(method, url, { token, json, form, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { h["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (raw !== undefined) { body = raw; }
  if (form) body = form;
  const t0 = performance.now();
  const res = await fetch(url.startsWith("http") ? url : API + url, { method, headers: h, body });
  const ms = performance.now() - t0;
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers, ms, text };
}

function complaintForm(fields = {}, file) {
  const f = new FormData();
  f.append("category", fields.category ?? "Pothole");
  f.append("description", fields.description ?? `System test pothole ${run}`);
  f.append("location", fields.location ?? "Outer Ring Road, km 12");
  if (file) f.append("image", new Blob([file.buf], { type: file.type }), file.name);
  return f;
}

function dlForm(buf, type, name = "road.jpg") {
  const f = new FormData();
  f.append("file", new Blob([buf], { type }), name);
  return f;
}

async function test(id, stp, title, fn) {
  const t0 = performance.now();
  try {
    const observed = await fn();
    results.push({ id, stp, title, status: "Pass", observed: observed ?? "As expected", ms: Math.round(performance.now() - t0) });
    console.log(`PASS ${id} ${title}`);
  } catch (e) {
    results.push({ id, stp, title, status: "Fail", observed: e.message, ms: Math.round(performance.now() - t0) });
    console.log(`FAIL ${id} ${title}\n     ${e.message}`);
  }
}

function expect(cond, msg) { if (!cond) throw new Error(msg); }
const is = (r, code, what = "") => expect(r.status === code, `expected HTTP ${code} ${what}, got ${r.status}: ${typeof r.data === "string" ? r.data.slice(0, 120) : JSON.stringify(r.data).slice(0, 160)}`);

function forgeToken(sub, role) {
  const secret = env("JWT_SECRET");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ role, sub, iat: now, exp: now + 600 });
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

async function login(email, password) {
  const r = await call("POST", "/auth/login", { json: { email, password } });
  is(r, 200, `login ${email}`);
  return r.data;
}

// ------------------------------------------------------------------ main suite
async function mainSuite() {
  const citizenA = { name: "System Citizen A", email: `citizen.a.${run}@trafficcare.test`, password: `Pw-${run}-aaaa` };
  const citizenB = { name: "System Citizen B", email: `citizen.b.${run}@trafficcare.test`, password: `Pw-${run}-bbbb` };

  // --- Environment and health
  await test("SYS-01", "NFR-REL-02", "Backend health endpoint responds", async () => {
    const r = await call("GET", "/health"); is(r, 200); expect(r.data.status === "ok", "status not ok");
    return `200 ok in ${r.ms.toFixed(0)} ms`;
  });
  await test("SYS-02", "TC-DL-01", "DL service health reports the model is loaded", async () => {
    const r = await call("GET", `${DL}/health`); is(r, 200); expect(r.data.model_loaded === true, "model not loaded");
    return `model_loaded=true on ${r.data.device}`;
  });
  await test("SYS-03", "TC-AUTH-11", "Seeded department accounts can sign in", async () => {
    const roads = await login("roads@trafficcare.com", env("DEPT_ROADS_PASSWORD"));
    const police = await login("police@trafficcare.com", env("DEPT_POLICE_PASSWORD"));
    expect(roads.user.role === "department" && police.user.role === "department", "wrong role");
    ctx.roads = roads.token; ctx.police = police.token;
    return "roads and police accounts: role department";
  });
  await test("SYS-04", "—", "Administrator can sign in", async () => {
    const a = await login(env("SYSTEM_TEST_ADMIN_EMAIL"), env("SYSTEM_TEST_ADMIN_PASSWORD"));
    expect(a.user.role === "admin", "not admin"); ctx.admin = a.token; return "role admin";
  });

  // --- Registration and login
  await test("SYS-05", "TC-AUTH-01/06", "Citizen registers; a client-supplied admin role is ignored", async () => {
    const r = await call("POST", "/auth/register", { json: { ...citizenA, role: "admin" } });
    is(r, 201); expect(r.data.user.role === "citizen", `role ${r.data.user.role}`);
    expect(!("password" in r.data.user), "password returned");
    const r2 = await call("POST", "/auth/register", { json: citizenB }); is(r2, 201);
    return "201, role citizen, no password in response";
  });
  await test("SYS-06", "TC-AUTH-02", "Duplicate e-mail with different case is rejected", async () => {
    const r = await call("POST", "/auth/register", { json: { ...citizenA, email: citizenA.email.toUpperCase() } });
    is(r, 409); return "409";
  });
  await test("SYS-07", "TC-AUTH-03/04", "Invalid registration input is rejected", async () => {
    for (const body of [{ ...citizenA, email: "not-an-email" }, { ...citizenA, password: "short7!" }, { ...citizenA, name: "x".repeat(101), email: `long.${run}@trafficcare.test` }]) {
      const r = await call("POST", "/auth/register", { json: body }); is(r, 400);
    }
    return "invalid e-mail, 7-char password, 101-char name: all 400";
  });
  await test("SYS-08", "TC-AUTH-07", "Citizen logs in and receives a 1-hour JWT", async () => {
    const a = await login(citizenA.email, citizenA.password);
    const b = await login(citizenB.email, citizenB.password);
    ctx.a = a.token; ctx.aId = a.user.id; ctx.b = b.token;
    const p = JSON.parse(Buffer.from(a.token.split(".")[1], "base64url"));
    expect(p.exp - p.iat === 3600, `lifetime ${p.exp - p.iat}`);
    return "200, exp - iat = 3600 s";
  });
  await test("SYS-09", "TC-AUTH-08", "Wrong password and unknown e-mail give the same 401", async () => {
    const r1 = await call("POST", "/auth/login", { json: { email: citizenA.email, password: "wrong-password" } });
    const r2 = await call("POST", "/auth/login", { json: { email: `nobody.${run}@trafficcare.test`, password: "whatever123" } });
    is(r1, 401); is(r2, 401); expect(r1.data.message === r2.data.message, "messages differ");
    return `both 401 "${r1.data.message}"`;
  });
  await test("SYS-10", "TC-AUTH-09", "NoSQL operator injection in login is rejected", async () => {
    const r = await call("POST", "/auth/login", { json: { email: { $gt: "" }, password: { $gt: "" } } });
    is(r, 400); return "400, no token";
  });

  // --- Access control
  await test("SYS-11", "TC-SEC-01/02", "Missing, malformed and wrongly signed tokens are rejected", async () => {
    is(await call("GET", "/complaints"), 401, "no token");
    is(await call("GET", "/complaints", { token: "not-a-jwt" }), 401, "malformed");
    const bad = forgeToken(ctx.aId, "citizen").replace(/\.[^.]+$/, ".invalidsignature");
    is(await call("GET", "/complaints", { token: bad }), 401, "bad signature");
    return "401 for all three";
  });
  await test("SYS-12", "TC-SEC-04", "Citizen is refused on admin and department routes", async () => {
    is(await call("GET", "/admin/complaints", { token: ctx.a }), 403, "admin");
    is(await call("GET", "/department/complaints", { token: ctx.a }), 403, "department");
    return "403 on both";
  });
  await test("SYS-13", "TC-SEC-05", "A validly signed token claiming role=admin for a citizen is refused", async () => {
    const forged = forgeToken(ctx.aId, "admin");
    is(await call("GET", "/admin/dashboard", { token: forged }), 403);
    return "403: role is read from the database";
  });

  // --- Complaint submission with the real DL service
  await test("SYS-14", "TC-CMP-06, TC-AI-01", "Complaint with JPEG photo is stored and classified by the DL service", async () => {
    const r = await call("POST", "/complaints", { token: ctx.a, form: complaintForm({}, { buf: JPEG, type: "image/jpeg", name: "pothole.jpg" }) });
    is(r, 201);
    const c = r.data.complaint; ctx.c1 = c._id; ctx.c1img = c.imageUrl;
    expect(/^\/uploads\/[0-9a-f-]{36}\.jpg$/.test(c.imageUrl), `imageUrl ${c.imageUrl}`);
    expect(c.aiPrediction.status === "Completed", `AI status ${c.aiPrediction.status}`);
    const probs = Object.values(c.aiPrediction.probabilities);
    expect(probs.length === 3 && Math.abs(probs.reduce((s, v) => s + v, 0) - 1) < 0.01, "probabilities");
    expect(c.status === "Submitted" && c.priority === "Medium" && c.departmentStatus === "Not Assigned", "defaults");
    ctx.submitMs = r.ms;
    return `201 in ${r.ms.toFixed(0)} ms; AI Completed: ${c.aiPrediction.category} (${(c.aiPrediction.confidence * 100).toFixed(1)} %); Submitted/Medium/Not Assigned`;
  });
  await test("SYS-15", "TC-SEC-08", "Uploaded image is served with nosniff", async () => {
    const r = await fetch(ORIGIN + ctx.c1img);
    expect(r.status === 200, `HTTP ${r.status}`);
    expect(r.headers.get("x-content-type-options") === "nosniff", "nosniff missing");
    return `200 ${r.headers.get("content-type")}, nosniff`;
  });
  await test("SYS-16", "TC-CMP-06", "PNG with a misleading .html file name is stored as .png", async () => {
    const r = await call("POST", "/complaints", { token: ctx.a, form: complaintForm({ category: "Road Sign", description: `Faded sign ${run}` }, { buf: PNG, type: "image/png", name: "evil.html" }) });
    is(r, 201); expect(r.data.complaint.imageUrl.endsWith(".png"), r.data.complaint.imageUrl);
    ctx.c2 = r.data.complaint._id;
    return `201, stored as ${path.basename(r.data.complaint.imageUrl)}`;
  });
  await test("SYS-17", "TC-CMP-01", "Complaint without a photo: AI Not Requested", async () => {
    const r = await call("POST", "/complaints", { token: ctx.a, form: complaintForm({ category: "Traffic Signal", description: `Signal stuck on red ${run}` }) });
    is(r, 201); expect(r.data.complaint.aiPrediction.status === "Not Requested", "AI status");
    ctx.c3 = r.data.complaint._id;
    return "201, AI Not Requested";
  });
  await test("SYS-18", "TC-CMP-03/04/05", "Invalid complaint input is rejected", async () => {
    is(await call("POST", "/complaints", { token: ctx.a, form: complaintForm({ category: "Flying Cars" }) }), 400, "category");
    is(await call("POST", "/complaints", { token: ctx.a, form: complaintForm({ location: "  " }) }), 400, "blank location");
    is(await call("POST", "/complaints", { token: ctx.a, form: complaintForm({ description: "d".repeat(2001) }) }), 400, "long description");
    return "invalid category, blank location, 2,001-char description: all 400";
  });
  await test("SYS-19", "TC-CMP-07", "GIF and over-10 MB images are rejected", async () => {
    const g = await call("POST", "/complaints", { token: ctx.a, form: complaintForm({}, { buf: Buffer.from("GIF89a"), type: "image/gif", name: "a.gif" }) });
    is(g, 400, "gif");
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0xff);
    const b = await call("POST", "/complaints", { token: ctx.a, form: complaintForm({}, { buf: big, type: "image/jpeg", name: "big.jpg" }) });
    is(b, 400, "big"); expect(/10 MB/.test(b.data.message), b.data.message);
    return `GIF 400 "${g.data.message}"; 10 MB + 1 byte 400 "${b.data.message}"`;
  });
  await test("SYS-20", "TC-CMP-09", "Each citizen lists only their own complaints, newest first", async () => {
    await call("POST", "/complaints", { token: ctx.b, form: complaintForm({ category: "Street Lighting", description: `Lamp out ${run}` }) });
    const a = await call("GET", "/complaints", { token: ctx.a });
    const b = await call("GET", "/complaints", { token: ctx.b });
    is(a, 200); is(b, 200);
    expect(a.data.count === 3 && b.data.count === 1, `counts A=${a.data.count} B=${b.data.count}`);
    const t = a.data.complaints.map((c) => Date.parse(c.createdAt));
    expect(t.every((v, i) => i === 0 || t[i - 1] >= v), "not newest first");
    return "A sees 3, B sees 1; newest first";
  });
  await test("SYS-21", "TC-CMP-10/11", "Citizen cannot open another citizen's complaint", async () => {
    is(await call("GET", `/complaints/${ctx.c1}`, { token: ctx.b }), 404, "other's");
    is(await call("GET", `/complaints/${ctx.c1}`, { token: ctx.a }), 200, "own");
    is(await call("GET", "/complaints/abc", { token: ctx.a }), 400, "malformed id");
    return "other's 404, own 200, malformed ID 400";
  });

  // --- DL service called directly
  await test("SYS-22", "TC-DL-02..05", "DL service rejects invalid files", async () => {
    is(await call("POST", `${DL}/predict`, { form: dlForm(Buffer.from("hello"), "text/plain", "a.txt") }), 400, "text");
    is(await call("POST", `${DL}/predict`, { form: dlForm(Buffer.alloc(0), "image/jpeg") }), 400, "empty");
    is(await call("POST", `${DL}/predict`, { form: dlForm(Buffer.alloc(10 * 1024 * 1024 + 1, 1), "image/jpeg") }), 413, "large");
    is(await call("POST", `${DL}/predict`, { form: dlForm(Buffer.from([0xff, 0xd8, 0x00, 0x01, 0x02]), "image/jpeg") }), 400, "corrupt");
    return "text 400, empty 400, > 10 MB 413, corrupted 400";
  });
  await test("SYS-23", "TC-DL-06", "DL service classifies a PNG with three class probabilities", async () => {
    const r = await call("POST", `${DL}/predict`, { form: dlForm(PNG, "image/png", "road.png") });
    is(r, 200);
    const p = r.data.prediction.probabilities;
    expect(Object.keys(p).sort().join() === "Normal Road,Pothole,Road Damage", Object.keys(p).join());
    ctx.dlMs = r.ms;
    return `200 in ${r.ms.toFixed(0)} ms: ${r.data.prediction.category}`;
  });

  // --- Administration
  await test("SYS-24", "TC-ADM-01", "Admin sees all complaints with reporter details and no passwords", async () => {
    const r = await call("GET", "/admin/complaints", { token: ctx.admin }); is(r, 200);
    const mine = r.data.complaints.find((c) => c._id === ctx.c1);
    expect(mine && mine.user.email === citizenA.email, "reporter missing");
    expect(!/password/i.test(JSON.stringify(r.data)), "password present");
    return `${r.data.count} complaints listed; reporter e-mail shown; no passwords`;
  });
  await test("SYS-25", "TC-ADM-10", "Admin dashboard counts match the stored complaints", async () => {
    const list = await call("GET", "/admin/complaints", { token: ctx.admin });
    const d = await call("GET", "/admin/dashboard", { token: ctx.admin }); is(d, 200);
    const submitted = list.data.complaints.filter((c) => c.status === "Submitted").length;
    expect(d.data.total === list.data.count && d.data.byStatus.Submitted === submitted, JSON.stringify(d.data));
    return `total ${d.data.total}, Submitted ${d.data.byStatus.Submitted}`;
  });
  await test("SYS-26", "TC-ADM-02/03", "Admin creates a department account; duplicate rejected", async () => {
    const body = { name: "Water Department", email: `water.${run}@trafficcare.test`, password: `Pw-${run}-water`, department: `Water Department ${run}` };
    const r = await call("POST", "/admin/departments", { token: ctx.admin, json: body }); is(r, 201);
    is(await call("POST", "/admin/departments", { token: ctx.admin, json: body }), 409, "duplicate");
    const l = await login(body.email, body.password); expect(l.user.role === "department", "role");
    return "201, new account can sign in as department; duplicate 409";
  });
  await test("SYS-27", "TC-ADM-04, TC-ADM-07", "Admin assigns the complaint to Roads & Maintenance and sets priority High", async () => {
    const a = await call("PATCH", `/admin/complaints/${ctx.c1}/assign`, { token: ctx.admin, json: { department: "Roads & Maintenance" } });
    is(a, 200);
    expect(a.data.complaint.status === "Assigned to Department" && a.data.complaint.departmentStatus === "Assigned", "statuses");
    const p = await call("PATCH", `/admin/complaints/${ctx.c1}`, { token: ctx.admin, json: { priority: "High" } });
    is(p, 200); expect(p.data.complaint.priority === "High", "priority");
    return "Assigned to Department / Assigned; priority High";
  });
  await test("SYS-28", "TC-ADM-05, TC-ADM-06", "Reassignment is recorded; unknown department rejected", async () => {
    is(await call("PATCH", `/admin/complaints/${ctx.c3}/assign`, { token: ctx.admin, json: { department: "Traffic Police" } }), 200);
    const r = await call("PATCH", `/admin/complaints/${ctx.c3}/assign`, { token: ctx.admin, json: { department: "Traffic Signal Department" } });
    is(r, 200);
    const last = r.data.complaint.progressUpdates.at(-1).message;
    expect(/Traffic Police/.test(last), `history: ${last}`);
    is(await call("PATCH", `/admin/complaints/${ctx.c3}/assign`, { token: ctx.admin, json: { department: "Ministry of Magic" } }), 404, "unknown");
    return `history: "${last}"; unknown department 404`;
  });
  await test("SYS-29", "TC-ADM-08", "Invalid status and priority values are rejected", async () => {
    is(await call("PATCH", `/admin/complaints/${ctx.c2}`, { token: ctx.admin, json: { status: "Done" } }), 400);
    is(await call("PATCH", `/admin/complaints/${ctx.c2}`, { token: ctx.admin, json: { priority: "Urgent" } }), 400);
    is(await call("PATCH", `/admin/complaints/${ctx.c2}`, { token: ctx.admin, json: {} }), 400);
    return "400 for each";
  });

  // --- Department workflow
  await test("SYS-30", "TC-DEP-01, TC-DEP-07", "Departments only see and act on their own complaints", async () => {
    const roads = await call("GET", "/department/complaints", { token: ctx.roads });
    const police = await call("GET", "/department/complaints", { token: ctx.police });
    expect(roads.data.complaints.some((c) => c._id === ctx.c1), "roads missing complaint");
    expect(!police.data.complaints.some((c) => c._id === ctx.c1), "police sees roads complaint");
    is(await call("PATCH", `/department/complaints/${ctx.c1}/accept`, { token: ctx.police }), 404, "police accept");
    return "Roads lists it, Police does not; Police accept 404";
  });
  await test("SYS-31", "TC-DEP-04", "Progress before acceptance is rejected", async () => {
    is(await call("PATCH", `/department/complaints/${ctx.c1}/progress`, { token: ctx.roads, json: { message: "Starting" } }), 400);
    return "400";
  });
  await test("SYS-32", "TC-DEP-02/03", "Department accepts once; second acceptance rejected", async () => {
    const r = await call("PATCH", `/department/complaints/${ctx.c1}/accept`, { token: ctx.roads });
    is(r, 200); expect(r.data.complaint.status === "Accepted by Department", r.data.complaint.status);
    is(await call("PATCH", `/department/complaints/${ctx.c1}/accept`, { token: ctx.roads }), 400, "again");
    return "200 Accepted by Department; repeat 400";
  });
  await test("SYS-33", "TC-DEP-05/06", "Department posts progress and marks work completed", async () => {
    is(await call("PATCH", `/department/complaints/${ctx.c1}/progress`, { token: ctx.roads, json: { message: "" } }), 400, "empty");
    is(await call("PATCH", `/department/complaints/${ctx.c1}/progress`, { token: ctx.roads, json: { message: "x", status: "Resolved" } }), 400, "Resolved");
    const p = await call("PATCH", `/department/complaints/${ctx.c1}/progress`, { token: ctx.roads, json: { message: "Crew dispatched; area barricaded." } });
    is(p, 200); expect(p.data.complaint.status === "Work in Progress", p.data.complaint.status);
    const c = await call("PATCH", `/department/complaints/${ctx.c1}/progress`, { token: ctx.roads, json: { message: "Pothole filled and resurfaced.", status: "Work Completed" } });
    is(c, 200); expect(c.data.complaint.status === "Work Completed", c.data.complaint.status);
    return "empty/Resolved 400; Work in Progress → Work Completed";
  });
  await test("SYS-34", "TC-DEP-08", "Department cannot resolve through the admin API", async () => {
    is(await call("PATCH", `/admin/complaints/${ctx.c1}`, { token: ctx.roads, json: { status: "Resolved" } }), 403);
    return "403";
  });
  await test("SYS-35", "TC-ADM-09", "Admin verifies and resolves", async () => {
    const r = await call("PATCH", `/admin/complaints/${ctx.c1}`, { token: ctx.admin, json: { status: "Resolved" } });
    is(r, 200);
    expect(r.data.complaint.status === "Resolved" && r.data.complaint.departmentStatus === "Work Completed", "statuses");
    return "Resolved; department status Work Completed";
  });
  await test("SYS-36", "TC-UI-04 (API)", "Citizen sees the resolved complaint with full history", async () => {
    const r = await call("GET", `/complaints/${ctx.c1}`, { token: ctx.a }); is(r, 200);
    const h = r.data.complaint.progressUpdates;
    const roles = h.map((u) => u.role).join(" → ");
    expect(r.data.complaint.status === "Resolved" && h.length === 5, `status ${r.data.complaint.status}, ${h.length} entries`);
    return `Resolved, ${h.length} history entries: ${roles}`;
  });

  // History: assign, accept, progress, completed, resolved (priority changes add no entry).
  // --- Error handling
  await test("SYS-37", "TC-SEC-06/07", "Malformed JSON and unknown routes return JSON errors", async () => {
    const m = await call("POST", "/auth/login", { raw: '{"email": "a@b.com",', headers: { "Content-Type": "application/json" } });
    is(m, 400); expect(!/at .+\.js/.test(m.text), "stack trace");
    const u = await call("GET", "/does-not-exist"); is(u, 404);
    return `400 "${m.data.message}"; 404 "${u.data.message}"`;
  });
  await test("SYS-38", "CI-02", "CORS allows only the web client origin", async () => {
    const ok = await fetch(`${API}/health`, { headers: { Origin: "http://localhost:5173" } });
    const bad = await fetch(`${API}/health`, { headers: { Origin: "http://evil.example" } });
    expect(ok.headers.get("access-control-allow-origin") === "http://localhost:5173", "client origin not allowed");
    expect(bad.headers.get("access-control-allow-origin") !== "http://evil.example", "foreign origin allowed");
    return "client origin allowed; foreign origin not echoed";
  });

  // --- Performance sample
  await test("SYS-39", "NFR-PRF-01/02", "Response-time sample (20 requests each)", async () => {
    const time = async (fn) => { const v = []; for (let i = 0; i < 20; i++) v.push((await fn()).ms); v.sort((x, y) => x - y); return { med: v[9], p95: v[18] }; };
    const list = await time(() => call("GET", "/complaints", { token: ctx.a }));
    const admin = await time(() => call("GET", "/admin/complaints", { token: ctx.admin }));
    const dl = await time(() => call("POST", `${DL}/predict`, { form: dlForm(JPEG, "image/jpeg") }));
    ctx.perf = { list, admin, dl };
    expect(dl.p95 < 30000, "DL slower than 30 s timeout");
    return `citizen list median ${list.med.toFixed(0)} ms (p95 ${list.p95.toFixed(0)}); admin list median ${admin.med.toFixed(0)} ms; DL predict median ${dl.med.toFixed(0)} ms (p95 ${dl.p95.toFixed(0)})`;
  });
}

// ------------------------------------------------------------------ DL outage
async function outageSuite() {
  const c = { name: "Outage Citizen", email: `outage.${run}@trafficcare.test`, password: `Pw-${run}-out` };
  await call("POST", "/auth/register", { json: c });
  const t = (await login(c.email, c.password)).token;
  await test("SYS-40", "TC-SYS-03", "DL service is stopped", async () => {
    try { await fetch(`${DL}/health`, { signal: AbortSignal.timeout(3000) }); } catch { return "DL service unreachable"; }
    throw new Error("DL service still answering; stop it before running --outage");
  });
  await test("SYS-41", "TC-AI-02, NFR-REL-01", "Complaint with photo is still accepted while the DL service is down", async () => {
    const r = await call("POST", "/complaints", { token: t, form: complaintForm({ description: `Outage test ${run}` }, { buf: JPEG, type: "image/jpeg", name: "p.jpg" }) });
    is(r, 201);
    expect(r.data.complaint.aiPrediction.status === "Failed", r.data.complaint.aiPrediction.status);
    expect(r.data.complaint.imageUrl, "image not stored");
    return `201 in ${r.ms.toFixed(0)} ms; AI Failed; image stored`;
  });
}

const suite = OUTAGE ? "dl-outage" : "system-api";
console.log(`TrafficCare system tests (${suite}) against ${API} and ${DL}\n`);
if (OUTAGE) await outageSuite(); else await mainSuite();

const passed = results.filter((r) => r.status === "Pass").length;
const outDir = path.join(here, "results");
fs.mkdirSync(outDir, { recursive: true });
const meta = { suite, date: new Date().toISOString(), api: API, dl: DL, passed, total: results.length, perf: ctx.perf ?? null };
fs.writeFileSync(path.join(outDir, `${suite}-results.json`), JSON.stringify({ ...meta, results }, null, 2));
const md = [`# System test run: ${suite}`, "", `${meta.date} · ${passed}/${results.length} passed`, "",
  "| ID | STP case | Test | Status | Observed result | Time (ms) |", "|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.id} | ${r.stp} | ${r.title} | ${r.status} | ${String(r.observed).replace(/\|/g, "/")} | ${r.ms} |`)].join("\n");
fs.writeFileSync(path.join(outDir, `${suite}-results.md`), md + "\n");
console.log(`\n${passed}/${results.length} passed. Results in testing/system/results/${suite}-results.md`);
process.exit(passed === results.length ? 0 : 1);
