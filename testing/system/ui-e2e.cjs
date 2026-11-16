// TrafficCare browser end-to-end system tests (React UI on the running stack).
// Drives Google Chrome with puppeteer-core and saves a screenshot per step.
//
// Prerequisites: web client (:5173), backend, DL service and TEST MongoDB running;
// admin account created (node testing/system/create-admin.js); puppeteer-core
// available, e.g.  npm install --no-save puppeteer-core  (or set NODE_PATH).
//
//   node testing/system/ui-e2e.cjs
//
// Env: WEB_URL (default http://localhost:5173), API_URL, CHROME_PATH,
//      credentials from server/.env (SYSTEM_TEST_ADMIN_*, DEPT_ROADS_PASSWORD).
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const here = __dirname;
const envFile = path.join(here, "..", "..", "server", ".env");
const fileEnv = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fileEnv[m[1]] = m[2];
  }
}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d;
const WEB = env("WEB_URL", "http://localhost:5173");
const API = env("API_URL", "http://localhost:5050/api");
const CHROME = env("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const shots = path.join(here, "screenshots");
const outDir = path.join(here, "results");
fs.mkdirSync(shots, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const run = Math.random().toString(36).slice(2, 7);
const citizen = { name: "UI Test Citizen", email: `ui.citizen.${run}@trafficcare.test`, password: `Pw-${run}-ui-1` };
const description = `UI system test: deep pothole near the bus stop (${run})`;
const results = [];
let page;
let complaintId;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.innerText);
async function waitText(t, timeout = 15000) {
  await page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);
}
async function clickText(t, scope = "button") {
  await page.waitForFunction((s, sc) => [...document.querySelectorAll(sc)].some((b) => b.innerText.trim().startsWith(s)), { timeout: 15000 }, t, scope);
  await page.evaluate((s, sc) => [...document.querySelectorAll(sc)].find((b) => b.innerText.trim().startsWith(s)).click(), t, scope);
}
async function shot(id, selector) {
  if (selector) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), selector);
  await sleep(700); // let reveal animations settle
  const file = `${id}.png`;
  await page.screenshot({ path: path.join(shots, file) });
  return file;
}
async function step(id, stp, title, fn) {
  const t0 = Date.now();
  try {
    const { observed, screenshot } = (await fn()) || {};
    results.push({ id, stp, title, status: "Pass", observed: observed || "As expected", screenshot, ms: Date.now() - t0 });
    console.log(`PASS ${id} ${title}`);
  } catch (e) {
    let screenshot;
    try { screenshot = await shot(`${id}-failure`); } catch {}
    results.push({ id, stp, title, status: "Fail", observed: e.message.split("\n")[0], screenshot, ms: Date.now() - t0 });
    console.log(`FAIL ${id} ${title}\n     ${e.message.split("\n")[0]}`);
  }
}
const expect = (c, m) => { if (!c) throw new Error(m); };

async function fillAuth(mode, { name, email, password }) {
  await clickText(mode === "login" ? "Login" : "Register", ".auth-tabs button");
  await sleep(300);
  if (mode === "register") {
    await page.click('input[name="name"]', { clickCount: 3 });
    await page.type('input[name="name"]', name);
  }
  await page.click('input[name="email"]', { clickCount: 3 });
  await page.type('input[name="email"]', email);
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
}
async function logout() {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Log ?out$/i.test(b.innerText.trim())).click());
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
}
async function login(email, password) {
  await fillAuth("login", { email, password });
  await page.waitForFunction(() => !document.querySelector('input[name="email"]'), { timeout: 15000 });
  await sleep(500);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await step("UI-01", "TC42", "Sign-in page loads", async () => {
    await page.goto(WEB, { waitUntil: "networkidle0" });
    await page.waitForSelector('input[name="email"]');
    return { observed: "Login and Register tabs, e-mail and password fields shown", screenshot: await shot("UI-01-login") };
  });

  await step("UI-02", "TC42, TC-AUTH-01", "Citizen registers through the UI", async () => {
    await fillAuth("register", citizen);
    await waitText("Registration successful! Please log in.");
    return { observed: '"Registration successful! Please log in." shown', screenshot: await shot("UI-02-registered") };
  });

  await step("UI-03", "TC-AUTH-08, NFR-ACC-01", "Wrong password shows an accessible error", async () => {
    await fillAuth("login", { email: citizen.email, password: "wrong-password-1" });
    await page.waitForSelector('[role="alert"]');
    const msg = await page.$eval('[role="alert"]', (e) => e.innerText);
    expect(/Invalid email or password/.test(msg), msg);
    return { observed: `role="alert": "${msg}"`, screenshot: await shot("UI-03-login-error") };
  });

  await step("UI-04", "TC42, TC-UI-01", "Citizen signs in and sees the citizen dashboard", async () => {
    await login(citizen.email, citizen.password);
    await waitText("Submit a complaint");
    return { observed: "Citizen dashboard with complaint form and My complaints", screenshot: await shot("UI-04-citizen-dashboard") };
  });

  await step("UI-05", "TC-UI-03", "Client rejects a GIF before upload", async () => {
    const gif = path.join(outDir, "tmp-not-allowed.gif");
    fs.writeFileSync(gif, Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary"));
    const input = await page.$("#complaint-image");
    await input.uploadFile(gif);
    await sleep(500);
    const t = await text();
    fs.unlinkSync(gif);
    const shown = /JPG|PNG|JPEG/i.test(t.split("Submit complaint")[1] || "") && !(await page.$(".image-preview"));
    expect(shown, "no client-side error shown for GIF");
    await page.evaluate(() => { const i = document.getElementById("complaint-image"); if (i) i.value = ""; });
    return { observed: "Validation message shown; no preview", screenshot: await shot("UI-05-gif-rejected", ".modern-complaint-form") };
  });

  await step("UI-06", "TC43, TC-CMP-06, TC-AI-01", "Citizen submits a complaint with a photo; AI analysis appears", async () => {
    await page.select('select[name="category"]', "Pothole");
    await page.type('input[name="location"]', "Outer Ring Road, near Silk Board bus stop");
    await page.type('textarea[name="description"]', description);
    const input = await page.$("#complaint-image");
    await input.uploadFile(path.join(here, "fixtures", "road.jpg"));
    await page.waitForSelector(".image-preview img");
    await page.$eval(".modern-submit-button", (b) => b.scrollIntoView({ block: "center" }));
    await sleep(600);
    await page.click(".modern-submit-button");
    await page.waitForSelector('.notice[role="status"]', { timeout: 40000 });
    const notice = await page.$eval(".notice", (e) => e.innerText);
    await waitText(description);
    await page.waitForSelector(".ai-panel");
    const ai = await page.$eval(".ai-panel", (e) => e.innerText.replace(/\n+/g, " · "));
    const token = await page.evaluate(() => localStorage.getItem("token"));
    const r = await fetch(`${API}/complaints`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json());
    complaintId = r.complaints.find((c) => c.description === description)._id;
    return { observed: `"${notice}"; card shows Submitted; ${ai}`, screenshot: await shot("UI-06-complaint-submitted", ".modern-complaint-card") };
  });

  await step("UI-07", "TC44, FR-AUTH-08", "Logout clears the session; Back and reload stay on sign-in", async () => {
    await logout();
    const stored = await page.evaluate(() => [localStorage.getItem("token"), localStorage.getItem("user")]);
    expect(!stored[0] && !stored[1], "localStorage not cleared");
    // The app is a single page without router history, so Back leaves the app;
    // re-open the app URL as a user would and check the dashboard does not return.
    await page.goBack().catch(() => {});
    const leftApp = !page.url().startsWith(WEB);
    await page.goto(WEB, { waitUntil: "networkidle0" });
    expect(await page.$('input[name="email"]'), "dashboard shown after returning to the app");
    await page.reload({ waitUntil: "networkidle0" });
    expect(await page.$('input[name="email"]'), "dashboard shown after reload");
    return { observed: `token and user removed from localStorage; ${leftApp ? "Back leaves the single-page app; " : ""}re-opening and reloading the app shows sign-in`, screenshot: await shot("UI-07-logged-out") };
  });

  await step("UI-08", "TC45, TC-UI-01, TC-ADM-04/07", "Admin sets priority High and assigns Roads & Maintenance", async () => {
    await login(env("SYSTEM_TEST_ADMIN_EMAIL"), env("SYSTEM_TEST_ADMIN_PASSWORD"));
    await waitText("Manage complaints");
    await page.waitForSelector(`#priority-${complaintId}`);
    await page.select(`#priority-${complaintId}`, "High");
    await waitText("Complaint updated successfully.");
    await page.select(`#department-${complaintId}`, "Roads & Maintenance");
    await page.evaluate((id) => document.querySelector(`#department-${id}`).closest("article").querySelector(".assign-button").click(), complaintId);
    await waitText("Complaint assigned successfully.");
    const card = await page.evaluate((id) => document.querySelector(`#department-${id}`).closest("article").innerText, complaintId);
    expect(/Assigned to Department/.test(card) && /Priority:\s*High/.test(card), "card not updated");
    return { observed: "Card shows Assigned to Department, Roads & Maintenance, Priority High; AI analysis visible", screenshot: await shot("UI-08-admin-assigned", `#department-${complaintId}`) };
  });

  await step("UI-08b", "UI-04, TC-ADM-01", "Admin card still shows the reporter after an update", async () => {
    const card = await page.evaluate((id) => document.querySelector(`#department-${id}`).closest("article").innerText, complaintId);
    const ok = card.includes(citizen.name) && card.includes(citizen.email);
    const file = await shot("UI-08b-admin-reporter-after-update", `#department-${complaintId}`);
    expect(ok, `reporter shown as "${(card.match(/REPORTED BY\s*\n?([^\n]*)/i) || [, "?"])[1].trim()}" after the update (correct after a page reload)`);
    return { observed: "Reporter name and e-mail still shown", screenshot: file };
  });

  await step("UI-09", "TC-DEP-02/05, TC-UI-01", "Department accepts, posts progress and marks work completed", async () => {
    await logout();
    await login("roads@trafficcare.com", env("DEPT_ROADS_PASSWORD"));
    await waitText("Assigned Complaints");
    await waitText(description);
    const inCard = (sel) => page.evaluate((d, s) => [...document.querySelectorAll(".department-complaint")].find((c) => c.innerText.includes(d)).querySelector(s) !== null, description, sel);
    await page.evaluate((d) => [...[...document.querySelectorAll(".department-complaint")].find((c) => c.innerText.includes(d)).querySelectorAll("button")].find((b) => b.innerText.includes("Accept")).click(), description);
    await waitText("Complaint accepted successfully.");
    // The list reloads after every action (briefly showing "Loading..."), so wait for the card again.
    const cardReady = (sel) => page.waitForFunction((d, s) => {
      const c = [...document.querySelectorAll(".department-complaint")].find((x) => x.innerText.includes(d));
      return c && c.querySelector(s);
    }, { timeout: 15000 }, description, sel);
    await cardReady("textarea");
    expect(await inCard("textarea"), "progress form not shown after accepting");
    const typeAndClick = async (msg, label) => {
      await cardReady("textarea");
      await page.evaluate((d) => [...document.querySelectorAll(".department-complaint")].find((c) => c.innerText.includes(d)).querySelector("textarea").focus(), description);
      await page.keyboard.type(msg);
      await page.evaluate((d, l) => [...[...document.querySelectorAll(".department-complaint")].find((c) => c.innerText.includes(d)).querySelectorAll("button")].find((b) => b.innerText.includes(l)).click(), description, label);
    };
    await typeAndClick("Crew dispatched; lane barricaded.", "Update Progress");
    await waitText("Progress update submitted successfully.");
    await cardReady("textarea");
    await shot("UI-09a-department-progress", ".department-progress-form");
    await typeAndClick("Pothole filled and resurfaced.", "Mark Work Completed");
    await waitText("Work marked as completed. Awaiting admin verification.");
    await waitText("Waiting for");
    return { observed: "Accepted → Work in Progress → Work Completed; notices shown; completion note shown", screenshot: await shot("UI-09-department-completed", ".department-completed-note") };
  });

  await step("UI-10", "TC45, TC-ADM-09", "Admin verifies the work and sets Resolved", async () => {
    await logout();
    await login(env("SYSTEM_TEST_ADMIN_EMAIL"), env("SYSTEM_TEST_ADMIN_PASSWORD"));
    await page.waitForSelector(`#status-${complaintId}`);
    await page.select(`#status-${complaintId}`, "Resolved");
    await waitText("Complaint updated successfully.");
    const badge = await page.evaluate((id) => document.querySelector(`#status-${id}`).closest("article").querySelector(".complaint-status-badge").innerText, complaintId);
    expect(badge === "Resolved", badge);
    return { observed: "Status badge Resolved; statistics refreshed", screenshot: await shot("UI-10-admin-resolved", `#status-${complaintId}`) };
  });

  await step("UI-11", "TC-UI-04", "Citizen sees the complaint as Resolved", async () => {
    await logout();
    await login(citizen.email, citizen.password);
    await waitText(description);
    const card = await page.evaluate((d) => [...document.querySelectorAll(".modern-complaint-card")].find((c) => c.innerText.includes(d)).innerText, description);
    expect(/Resolved/.test(card), "status not Resolved");
    return { observed: "Card status Resolved", screenshot: await shot("UI-11-citizen-resolved", ".modern-complaint-card") };
  });

  await step("UI-12", "UI-03, TC-UI-04", "Citizen dashboard shows the progress history and assigned department", async () => {
    const card = await page.evaluate((d) => [...document.querySelectorAll(".modern-complaint-card")].find((c) => c.innerText.includes(d)).innerText, description);
    const hasHistory = /Pothole filled and resurfaced|Crew dispatched/.test(card);
    const hasDept = /Roads & Maintenance/.test(card);
    expect(hasHistory && hasDept, `history shown: ${hasHistory}, department shown: ${hasDept} (API returns both)`);
    return { observed: "History and department shown" };
  });

  await step("UI-13", "TC46", "Tampered token: user is returned to sign-in", async () => {
    await page.evaluate(() => localStorage.setItem("token", "tampered.token.value"));
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(1500);
    const onLogin = !!(await page.$('input[name="email"]'));
    const t = await text();
    const file = await shot("UI-13-tampered-token");
    expect(onLogin, `still on dashboard after reload; page says: "${(t.match(/(Unable[^\n]*|Session[^\n]*|expired[^\n]*)/i) || ["no message"])[0]}"`);
    return { observed: "Returned to sign-in", screenshot: file };
  });

  await step("UI-14", "UI-06, TC-UI-05", "Mobile width (375 px): no horizontal scrolling", async () => {
    await page.evaluate(() => localStorage.clear());
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(WEB, { waitUntil: "networkidle0" });
    const loginOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    await shot("UI-14a-mobile-login");
    await login(citizen.email, citizen.password);
    await waitText(description);
    const dashOk = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(loginOk && dashOk, `scrollWidth ${w[0]} > viewport ${w[1]}`);
    return { observed: `sign-in and citizen dashboard fit 375 px (scrollWidth ${w[0]})`, screenshot: await shot("UI-14-mobile-dashboard", ".modern-complaint-card") };
  });

  await step("UI-15", "NFR-ACC-01", "Sign-in form can be completed with the keyboard only", async () => {
    await page.setViewport({ width: 1366, height: 900 });
    await page.evaluate(() => localStorage.clear());
    await page.goto(WEB, { waitUntil: "networkidle0" });
    await page.focus('input[name="email"]');
    await page.keyboard.type(citizen.email);
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement.name);
    expect(focused === "password", `Tab moved focus to ${focused}`);
    await page.keyboard.type(citizen.password);
    await page.keyboard.press("Enter");
    await waitText("Submit a complaint");
    return { observed: "Tab from e-mail reaches password; Enter submits; dashboard opens" };
  });

  await browser.close();

  const passed = results.filter((r) => r.status === "Pass").length;
  const meta = { suite: "ui-e2e", date: new Date().toISOString(), web: WEB, passed, total: results.length, pageErrors: consoleErrors };
  fs.writeFileSync(path.join(outDir, "ui-e2e-results.json"), JSON.stringify({ ...meta, results }, null, 2));
  const md = ["# System test run: ui-e2e", "", `${meta.date} · ${passed}/${results.length} passed · Chrome (headless), 1366×900 and 375×812`, "",
    "| ID | STP case | Test | Status | Observed result | Screenshot |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.stp} | ${r.title} | ${r.status} | ${String(r.observed).replace(/\|/g, "/")} | ${r.screenshot ? `[${r.screenshot}](../screenshots/${r.screenshot})` : "none"} |`)].join("\n");
  fs.writeFileSync(path.join(outDir, "ui-e2e-results.md"), md + "\n");
  console.log(`\n${passed}/${results.length} passed. JavaScript page errors: ${consoleErrors.length}`);
  process.exit(passed === results.length ? 0 : 1);
})();
