// Playwright configuration for the TrafficCare browser end-to-end tests.
// The tests run against an already running stack (web client, backend, DL
// service, TEST MongoDB). See README.md in this folder.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // the steps form one end-to-end story and share data
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "results/playwright-results.json" }],
    ["./e2e/markdown-reporter.mjs"],
  ],
  use: {
    baseURL: process.env.WEB_URL || "http://localhost:5173",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Use the installed Google Chrome; set PW_CHANNEL="" to use Playwright's Chromium
    // (after `npx playwright install chromium`).
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  projects: [{ name: "chrome-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  outputDir: "test-results",
});
