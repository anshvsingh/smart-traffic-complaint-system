# System test run: dl-outage

2026-11-16T18:30:20.795Z · 2/2 passed

| ID | STP case | Test | Status | Observed result | Time (ms) |
|---|---|---|---|---|---|
| SYS-40 | TC-SYS-03 | DL service is stopped | Pass | DL service unreachable | 2 |
| SYS-41 | TC-AI-02, NFR-REL-01 | Complaint with photo is still accepted while the DL service is down | Pass | 201 in 15 ms; AI Failed; image stored | 15 |
