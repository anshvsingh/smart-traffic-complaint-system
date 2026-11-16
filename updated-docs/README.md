# TrafficCare Documentation

Version 2.0 · 16 November 2026. Every document is available as Word (for submission and printing) and Markdown (readable on GitHub, with live Mermaid diagrams).

| Document | Standard | Word | Markdown |
|---|---|---|---|
| Software Requirements Specification (SRS) | ISO/IEC/IEEE 29148 | [TrafficCare_SRS.docx](TrafficCare_SRS.docx) | [TrafficCare_SRS.md](TrafficCare_SRS.md) |
| Software Architecture and Design (SAD) | ISO/IEC/IEEE 42010, IEEE 1016 | [TrafficCare_SAD.docx](TrafficCare_SAD.docx) | [TrafficCare_SAD.md](TrafficCare_SAD.md) |
| Software Test Plan (STP) | IEEE 829 / ISO/IEC/IEEE 29119-3 | [TrafficCare_STP.docx](TrafficCare_STP.docx) | [TrafficCare_STP.md](TrafficCare_STP.md) |
| UML Diagrams (14 diagrams) | UML 2.5 | [TrafficCare_UML.docx](TrafficCare_UML.docx) | [TrafficCare_UML.md](TrafficCare_UML.md) |

## What each document covers

- **SRS:** scope, users, operating environment, constraints. Then numbered, prioritised and verifiable requirements: authentication, complaints, AI classification, administration, department workflow, the ML/DL/QML research module, data dictionary, non-functional requirements, business rules and a traceability matrix.
- **SAD:** architectural drivers, plus context, logical, process, data, interface, AI/ML, security, deployment and development views. Also covers design decisions, risks and technical debt.
- **STP:** test items, approach and techniques, pass/fail and suspension criteria, and 75 test cases traced to SRS requirements (including ML/DL/QML model evaluation). Also covers the environment, the latest reported results, defect status, responsibilities and risks.
- **UML:** use case diagram with use case descriptions, domain and backend class diagrams, component and deployment diagrams, five sequence diagrams, an end-to-end activity diagram, complaint and department state machines, and the ML experiment pipeline.

## Folders

- [`uml/`](uml/): editable Mermaid sources (`.mmd`) for every UML diagram, plus `use-case.png`.
- [`ux/`](ux/): UX design and evaluation, screen diagram, screen transitions and screenshots.

Test results in the STP come from the repository's own records. A case is marked Pass or Fail only after a recorded run.
