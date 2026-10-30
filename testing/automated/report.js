// Turn Jest's JSON output into a markdown results table.
//   node testing/automated/report.js testing/automated/last-run.json > testing/automated/latest-results.md

const fs = require("fs");

const file = process.argv[2] || `${__dirname}/last-run.json`;
const run = JSON.parse(fs.readFileSync(file, "utf8"));

const rows = [];
for (const suite of run.testResults) {
  for (const t of suite.assertionResults) {
    const match = t.title.match(/^(TC\d+[a-z]?)\s+(.*)$/);
    const id = match ? match[1] : "-";
    const name = match ? match[2] : t.title;
    const status = t.status === "passed" ? "Pass" : t.status === "failed" ? "Fail" : "Not Run";
    const firstError = (t.failureMessages || [])[0] || "";
    const actual = status === "Pass"
      ? "As expected"
      : firstError.split("\n").filter((l) => /^\s*(Expected|Received)/.test(l)).map((l) => l.trim()).join("; ")
        || firstError.split("\n")[0];
    rows.push({ id, name, status, actual: (actual || "").replace(/\|/g, "\\|").replace(/\u001b\[\d+m/g, "") });
  }
}
rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

const when = new Date(run.startTime).toISOString();
const passed = rows.filter((r) => r.status === "Pass").length;
console.log(`# Automated run ${when}\n`);
console.log(`${passed}/${rows.length} passed.\n`);
console.log("| Test ID | Test case | Status | Actual result (first assertion message if failed) |");
console.log("|---|---|---|---|");
for (const r of rows) console.log(`| ${r.id} | ${r.name} | ${r.status} | ${r.actual} |`);
