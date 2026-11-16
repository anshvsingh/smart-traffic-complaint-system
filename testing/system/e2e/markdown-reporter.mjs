// Writes results/ui-e2e-results.md: one row per test with its ID, STP case,
// status, observed result and screenshot (taken from test annotations).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default class MarkdownReporter {
  constructor() {
    this.rows = [];
  }

  onTestEnd(test, result) {
    const note = (type) => test.annotations.find((a) => a.type === type)?.description ?? "";
    const [id, ...rest] = test.title.split(" ");
    const status = result.status === "passed" ? "Pass" : result.status === "skipped" ? "Not Run" : "Fail";
    const observed = status === "Fail" ? (result.error?.message ?? "").split("\n")[0].replace(/\u001b\[[0-9;]*m/g, "") : note("observed") || "As expected";
    const shot = note("screenshot");
    this.rows.push({ id, title: rest.join(" "), stp: note("stp"), status, observed, shot, ms: result.duration });
  }

  onEnd(result) {
    const passed = this.rows.filter((r) => r.status === "Pass").length;
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "results");
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
      "# System test run: ui-e2e (Playwright)",
      "",
      `${new Date().toISOString()} · ${passed}/${this.rows.length} passed · Playwright, Google Chrome, 1366×900 and 375×812 · overall ${result.status}`,
      "",
      "| ID | STP case | Test | Status | Observed result | Screenshot |",
      "|---|---|---|---|---|---|",
      ...this.rows.map((r) =>
        `| ${r.id} | ${r.stp} | ${r.title} | ${r.status} | ${String(r.observed).replace(/\|/g, "/")} | ${r.shot ? `[${r.shot}](../screenshots/${r.shot})` : "none"} |`),
    ];
    fs.writeFileSync(path.join(dir, "ui-e2e-results.md"), lines.join("\n") + "\n");
  }

  // The built-in JSON reporter records absolute paths; make them repo-relative.
  async onExit() {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "results");
    const json = path.join(dir, "playwright-results.json");
    if (!fs.existsSync(json)) return;
    const repoRoot = path.resolve(dir, "..", "..", "..");
    const text = fs.readFileSync(json, "utf8").split(repoRoot + path.sep).join("").split(repoRoot).join(".");
    fs.writeFileSync(json, text);
  }
}
