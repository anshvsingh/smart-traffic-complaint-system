// TrafficCare browser end-to-end system tests (Playwright).
// One end-to-end story on the RUNNING stack: a citizen reports a pothole with a
// photo, the admin assigns it, the department completes the work, the admin
// resolves it and the citizen sees the history. Plus session, validation,
// mobile and keyboard checks. A screenshot is saved for every step.
//
// Prerequisites: web client (:5173), backend, DL service and a TEST MongoDB are
// running, and the admin exists (node create-admin.js). Run from testing/system:
//   npx playwright test
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const systemDir = path.join(here, "..");
const shots = path.join(systemDir, "screenshots");
fs.mkdirSync(shots, { recursive: true });

// Credentials come from server/.env (never committed).
const fileEnv = {};
const envFile = path.join(systemDir, "..", "..", "server", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) fileEnv[m[1]] = m[2];
  }
}
const env = (k, d) => process.env[k] ?? fileEnv[k] ?? d;
const API = env("API_URL", "http://localhost:5050/api");
const ADMIN = { email: env("SYSTEM_TEST_ADMIN_EMAIL"), password: env("SYSTEM_TEST_ADMIN_PASSWORD") };
const ROADS = { email: "roads@trafficcare.com", password: env("DEPT_ROADS_PASSWORD") };

const run = Math.random().toString(36).slice(2, 7);
const citizen = { name: "UI Test Citizen", email: `ui.citizen.${run}@trafficcare.test`, password: `Pw-${run}-ui-1` };
const description = `UI system test: deep pothole near the bus stop (${run})`;

test.describe.configure({ mode: "serial" });

/** @type {import('@playwright/test').Page} */
let page;
let complaintId;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
});
test.afterAll(async () => {
  await page.close();
});

function note(stp, observed) {
  test.info().annotations.push({ type: "stp", description: stp });
  if (observed) test.info().annotations.push({ type: "observed", description: observed });
}
async function shot(name, locator) {
  if (locator) await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700); // let entrance animations settle
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(shots, file) });
  test.info().annotations.push({ type: "screenshot", description: file });
}

const emailInput = () => page.locator('input[name="email"]');
const authTab = (name) => page.locator(".auth-tabs").getByRole("button", { name, exact: true });

async function signIn({ email, password }) {
  await authTab("Login").click();
  await emailInput().fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(emailInput()).toHaveCount(0);
}
async function signOut() {
  await page.getByRole("button", { name: /^Log ?out$/i }).click();
  await expect(emailInput()).toBeVisible();
}
const citizenCard = () => page.locator(".modern-complaint-card").filter({ hasText: description });
const adminCard = () => page.locator(".complaint-card").filter({ has: page.locator(`#department-${complaintId}`) });
const departmentCard = () => page.locator(".department-complaint").filter({ hasText: description });

test("UI-01 Sign-in page loads", async () => {
  note("TC42", "Login and Register tabs, e-mail and password fields shown");
  await page.goto("/");
  await expect(emailInput()).toBeVisible();
  await expect(authTab("Login")).toBeVisible();
  await expect(authTab("Register")).toBeVisible();
  await shot("UI-01-login");
});

test("UI-02 Citizen registers through the UI", async () => {
  note("TC42, TC-AUTH-01", '"Registration successful! Please log in." shown');
  await authTab("Register").click();
  await page.locator('input[name="name"]').fill(citizen.name);
  await emailInput().fill(citizen.email);
  await page.locator('input[name="password"]').fill(citizen.password);
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page.getByText("Registration successful! Please log in.")).toBeVisible();
  await shot("UI-02-registered");
});

test("UI-03 Wrong password shows an accessible error", async () => {
  note("TC-AUTH-08, NFR-ACC-01", 'role="alert": "Invalid email or password"');
  await authTab("Login").click();
  await emailInput().fill(citizen.email);
  await page.locator('input[name="password"]').fill("wrong-password-1");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await expect(page.getByRole("alert")).toHaveText(/Invalid email or password/);
  await shot("UI-03-login-error");
});

test("UI-04 Citizen signs in and sees the citizen dashboard", async () => {
  note("TC42, TC-UI-01", "Citizen dashboard with complaint form and My complaints");
  await signIn(citizen);
  await expect(page.getByRole("heading", { name: "Submit a complaint" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My complaints" })).toBeVisible();
  await shot("UI-04-citizen-dashboard");
});

test("UI-05 Client rejects a GIF before upload", async () => {
  note("TC-UI-03", '"Please select a JPG or PNG image." shown; no preview');
  await page.locator("#complaint-image").setInputFiles({
    name: "not-allowed.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary"),
  });
  await expect(page.getByText("Please select a JPG or PNG image.")).toBeVisible();
  await expect(page.locator(".image-preview")).toHaveCount(0);
  await shot("UI-05-gif-rejected", page.locator(".modern-complaint-form"));
});

test("UI-06 Citizen submits a complaint with a photo; AI analysis appears", async () => {
  await page.locator('select[name="category"]').selectOption("Pothole");
  await page.locator('input[name="location"]').fill("Outer Ring Road, near Silk Board bus stop");
  await page.locator('textarea[name="description"]').fill(description);
  await page.locator("#complaint-image").setInputFiles(path.join(systemDir, "fixtures", "road.jpg"));
  await expect(page.locator(".image-preview img")).toBeVisible();
  await page.getByRole("button", { name: /Submit complaint/ }).click();
  const notice = page.locator('.notice[role="status"]');
  await expect(notice).toContainText("Complaint submitted", { timeout: 40_000 });
  await expect(citizenCard()).toBeVisible();
  await expect(citizenCard().locator(".ai-panel")).toBeVisible();
  const ai = (await citizenCard().locator(".ai-panel").innerText()).replace(/\n+/g, " · ");
  const token = await page.evaluate(() => localStorage.getItem("token"));
  const list = await (await fetch(`${API}/complaints`, { headers: { Authorization: `Bearer ${token}` } })).json();
  complaintId = list.complaints.find((c) => c.description === description)._id;
  note("TC43, TC-CMP-06, TC-AI-01", `"${await notice.innerText()}"; card shows Submitted; ${ai}`);
  await shot("UI-06-complaint-submitted", citizenCard());
});

test("UI-07 Logout clears the session; reopening and reloading stay on sign-in", async () => {
  note("TC44, FR-AUTH-08", "token and user removed from localStorage; re-opening and reloading the app shows sign-in");
  await signOut();
  const stored = await page.evaluate(() => [localStorage.getItem("token"), localStorage.getItem("user")]);
  expect(stored).toEqual([null, null]);
  await page.goto("/");
  await expect(emailInput()).toBeVisible();
  await page.reload();
  await expect(emailInput()).toBeVisible();
  await shot("UI-07-logged-out");
});

test("UI-08 Admin sets priority High and assigns Roads & Maintenance", async () => {
  note("TC45, TC-UI-01, TC-ADM-04/07", "Card shows Assigned to Department, Roads & Maintenance, Priority High; AI analysis visible");
  await signIn(ADMIN);
  await expect(page.getByText("Manage complaints")).toBeVisible();
  await page.locator(`#priority-${complaintId}`).selectOption("High");
  await expect(page.getByText("Complaint updated successfully.")).toBeVisible();
  await page.locator(`#department-${complaintId}`).selectOption("Roads & Maintenance");
  await adminCard().getByRole("button", { name: "Assign Department" }).click();
  await expect(page.getByText("Complaint assigned successfully.")).toBeVisible();
  await expect(adminCard().locator(".complaint-status-badge")).toHaveText("Assigned to Department");
  await expect(adminCard()).toContainText(/Priority:\s*High/);
  await shot("UI-08-admin-assigned", page.locator(`#department-${complaintId}`));
});

test("UI-08b Admin card still shows the reporter after an update", async () => {
  note("UI-04, TC-ADM-01", "Reporter name and e-mail still shown");
  await expect(adminCard()).toContainText(citizen.name);
  await expect(adminCard()).toContainText(citizen.email);
  await shot("UI-08b-admin-reporter-after-update", page.locator(`#department-${complaintId}`));
});

test("UI-09 Department accepts, posts progress and marks work completed", async () => {
  note("TC-DEP-02/05, TC-UI-01", "Accepted → Work in Progress → Work Completed; notices shown; completion note shown");
  await signOut();
  await signIn(ROADS);
  await expect(page.getByRole("heading", { name: "Assigned Complaints" })).toBeVisible();
  await departmentCard().getByRole("button", { name: "Accept Assignment" }).click();
  await expect(page.getByText("Complaint accepted successfully.")).toBeVisible();
  // Playwright locators re-query after the list reloads, so no manual waiting is needed.
  await departmentCard().getByLabel("Progress update").fill("Crew dispatched; lane barricaded.");
  await departmentCard().getByRole("button", { name: "Update Progress" }).click();
  await expect(page.getByText("Progress update submitted successfully.")).toBeVisible();
  await shot("UI-09a-department-progress", departmentCard().locator(".department-progress-form"));
  await departmentCard().getByLabel("Progress update").fill("Pothole filled and resurfaced.");
  await departmentCard().getByRole("button", { name: "Mark Work Completed" }).click();
  await expect(page.getByText("Work marked as completed. Awaiting admin verification.")).toBeVisible();
  await expect(departmentCard().locator(".department-completed-note")).toBeVisible();
  await shot("UI-09-department-completed", departmentCard().locator(".department-completed-note"));
});

test("UI-10 Admin verifies the work and sets Resolved", async () => {
  note("TC45, TC-ADM-09", "Status badge Resolved; statistics refreshed");
  await signOut();
  await signIn(ADMIN);
  await page.locator(`#status-${complaintId}`).selectOption("Resolved");
  await expect(page.getByText("Complaint updated successfully.")).toBeVisible();
  await expect(adminCard().locator(".complaint-status-badge")).toHaveText("Resolved");
  await shot("UI-10-admin-resolved", page.locator(`#status-${complaintId}`));
});

test("UI-11 Citizen sees the complaint as Resolved", async () => {
  note("TC-UI-04", "Card status Resolved");
  await signOut();
  await signIn(citizen);
  await expect(citizenCard().locator(".modern-status")).toHaveText(/Resolved/);
  await shot("UI-11-citizen-resolved", citizenCard());
});

test("UI-12 Citizen dashboard shows the progress history and assigned department", async () => {
  const tracking = citizenCard().locator(".complaint-tracking");
  await expect(tracking).toContainText("Handled by");
  await expect(tracking).toContainText("Roads & Maintenance");
  const entries = tracking.locator(".tracking-history li");
  await expect(entries).toHaveCount(5);
  await expect(entries.first()).toContainText("Administrator updated complaint status to Resolved.");
  await expect(tracking).toContainText("Pothole filled and resurfaced.");
  note("UI-03, TC-UI-04", '"Handled by Roads & Maintenance"; progress history with 5 entries, newest first');
  await shot("UI-12-citizen-history", tracking);
});

test("UI-13 Tampered token: user is returned to sign-in", async () => {
  note("TC46", "Returned to sign-in");
  await page.evaluate(() => localStorage.setItem("token", "tampered.token.value"));
  await page.reload();
  await expect(emailInput()).toBeVisible();
  await shot("UI-13-tampered-token");
});

test("UI-14 Mobile width (375 px): no horizontal scrolling", async () => {
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await fits()).toBe(true);
  await shot("UI-14a-mobile-login");
  await signIn(citizen);
  await expect(citizenCard()).toBeVisible();
  expect(await fits()).toBe(true);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  note("UI-06, TC-UI-05", `sign-in and citizen dashboard fit 375 px (scrollWidth ${width})`);
  await shot("UI-14-mobile-dashboard", citizenCard());
});

test("UI-15 Sign-in form can be completed with the keyboard only", async () => {
  note("NFR-ACC-01", "Tab from e-mail reaches password; Enter submits; dashboard opens");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await emailInput().focus();
  await page.keyboard.type(citizen.email);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.name)).toBe("password");
  await page.keyboard.type(citizen.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Submit a complaint" })).toBeVisible();
});
