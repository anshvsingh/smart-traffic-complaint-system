# TrafficCare: UX Design & Evaluation

**Smart Traffic Complaint and Monitoring System · UI v2 · November 2026**

This document covers the user experience of the TrafficCare web application: its users and goals, screens and navigation, complaint lifecycle, design system, accessibility considerations, and heuristic evaluation.

TrafficCare allows citizens to report traffic-related problems, administrators to review and assign complaints, and responsible departments to record their work and submit completion updates. Administrators verify completed work before complaints are officially resolved.

---

## 1. Users and goals

TrafficCare has three user roles.

| User | Main goal | What success looks like |
|---|---|---|
| **Citizen** | Report a traffic problem and track its progress | Can submit a complaint with supporting evidence and see its status and progress history |
| **Administrator** | Review complaints, assign departments, and verify resolutions | Can view all complaints, manage their status and priority, assign departments, and verify completed work |
| **Department** | Handle assigned complaints and report progress | Can view only complaints assigned to its department, accept assignments, record progress, and report completed work |

All three roles use the same login system. The server determines the authenticated user's role and the application directs the user to the appropriate dashboard.

Public registration creates citizen accounts. Administrator and department accounts are managed separately rather than being created through public citizen registration.

## 2. Screen inventory

| ID | Screen | Purpose | Key elements |
|---|---|---|---|
| **S1** | Login | Authenticate users | Email, password, validation messages, registration link |
| **S2** | Register | Create a citizen account | Name, email, password, validation and success messages |
| **S3** | Citizen dashboard | Submit and track complaints | Greeting, complaint statistics, complaint form, optional photo, AI analysis, complaint list and progress information |
| **S4** | Admin dashboard | Manage all complaints | Complaint statistics, complaint cards, status and priority controls, department assignment, citizen information and AI analysis |
| **S5** | Department dashboard | Handle assigned complaints | Assigned complaint list, complaint details, acceptance action, progress update form and completion action |
| **S6** | Complaint details | Inspect an individual complaint | Complaint description, location, citizen information, current status and progress history |

The complaint details view is presented as a modal within the department dashboard rather than as a separate application page.

## 3. User journeys and screen transitions

### 3.1 Authentication and navigation

On application startup, an existing valid session takes the user directly to the appropriate dashboard.

| From | Event | To |
|---|---|---|
| App start | No saved session | S1 Login |
| App start | Citizen session | S3 Citizen dashboard |
| App start | Admin session | S4 Admin dashboard |
| App start | Department session | S5 Department dashboard |
| S1 | Select Register | S2 Register |
| S2 | Select Login | S1 Login |
| S2 | Successful registration | S1 Login |
| S1 | Invalid credentials | S1 with an error message |
| S1 | Successful citizen login | S3 |
| S1 | Successful admin login | S4 |
| S1 | Successful department login | S5 |
| S3, S4, S5 | Logout | S1 Login |

The server controls authorization. Dashboard access and API operations are restricted according to the authenticated user's role.

### 3.2 Citizen complaint journey

1. The citizen logs in.
2. The citizen opens the complaint form.
3. The citizen selects a complaint category and enters its description and location.
4. The citizen can attach a photograph as evidence.
5. The backend processes the complaint and can provide an AI-based image prediction.
6. The complaint is saved with the initial status **Submitted**.
7. The citizen can view their submitted complaints and follow subsequent status changes and progress updates.

### 3.3 Administrator journey

1. The administrator logs in and opens the admin dashboard.
2. The administrator reviews submitted complaints.
3. The administrator can change complaint status and priority.
4. The administrator chooses the responsible department and assigns the complaint.
5. The department receives the complaint in its dashboard.
6. The administrator monitors progress updates.
7. After the department reports completion, the administrator verifies the work.
8. The administrator marks the complaint **Resolved** when satisfied that the issue has been addressed.

### 3.4 Department journey

1. Department staff log in using their department account.
2. The dashboard displays complaints assigned to that department.
3. Staff inspect a complaint and accept the assignment.
4. Staff enter progress messages as work proceeds.
5. Staff submit **Work Completed** when they believe the work is finished.
6. The complaint remains pending administrator verification until the administrator resolves it.

Department staff cannot independently close a complaint as **Resolved**.

## 4. Complaint status lifecycle

The complaint lifecycle distinguishes between administrative review, departmental responsibility, work completion, and final verification.

| Status | Meaning | Responsible role |
|---|---|---|
| **Submitted** | A citizen has successfully registered a complaint. | System |
| **Under Review** | The administrator is reviewing the complaint. | Administrator |
| **Assigned to Department** | The complaint has been forwarded to a responsible department. | Administrator |
| **Accepted by Department** | The department has accepted responsibility for the assignment. | Department |
| **Work in Progress** | The department is actively working on the complaint. | Department |
| **Work Completed** | The department has reported that the work is finished. | Department |
| **Resolved** | The administrator has verified the completion and officially closed the complaint. | Administrator |
| **Rejected** | The administrator has rejected the complaint. | Administrator |

**Important distinction:** Work Completed and Resolved are not interchangeable. Work Completed is a departmental completion report; Resolved is the administrator's final verification.

The older **In Progress** status is retained in the backend for compatibility with existing records, but **Work in Progress** is the preferred status in the current workflow.

### 4.1 Department assignment

The system uses category-based department suggestions:

| Complaint category | Suggested department |
|---|---|
| Pothole | Roads & Maintenance |
| Traffic Signal | Traffic Signal Department |
| Illegal Parking | Traffic Police |
| Road Blockage | Roads & Maintenance |
| Traffic Congestion | Traffic Police |
| Street Lighting | Electrical Department |
| Accident | Traffic Police |
| Pedestrian Safety | Traffic Police |
| Road Sign | Roads & Maintenance |
| Public Transport | Transport Department |

The administrator can override the suggested department before forwarding the complaint.

### 4.2 Progress history

Progress updates are recorded with information about the user who submitted them, their role, the message, and the associated status.

This provides a history of complaint handling and helps citizens and administrators understand what has happened since the complaint was submitted.

## 5. Design system

The visual direction of TrafficCare is intended to be editorial and calm, using a warm-white page, large typography, and a soft gradient aura.

The interface aims to feel approachable and trustworthy rather than like a traditional government form.

### 5.1 Typography

| Role | Typeface | Use |
|---|---|---|
| Display | Instrument Serif | Hero headlines, section titles and prominent statistics |
| Interface | Inter | Labels, body text, buttons, forms and dashboard information |

Display typography establishes visual hierarchy, while interface typography supports readability and efficient interaction.

### 5.2 Colour tokens

The original design evaluation used the following palette:

| Token | Value | Use |
|---|---|---|
| `--ink` | `#121116` | Headings and body text |
| `--ink-soft` | `#3a3842` | Secondary text |
| `--muted` | `#6f6b77` | Captions and hints |
| `--lavender` | `#6655f0` | Links and accents |
| Paper | `#fbfaf8` | Main page background |

The original accessibility evaluation reported that these text combinations passed WCAG 2.1 AA contrast requirements.

Status is communicated using text labels as well as colour, so users do not need to rely on colour alone.

### 5.3 Layout and components

The design uses a consistent visual language across authentication and dashboard screens.

Key interface elements include:

- **Hairline fields:** Inputs use understated borders and a visible focus treatment.
- **Pill buttons:** Primary and secondary actions have distinct visual styles.
- **Status pills:** Complaint states are displayed using labelled status indicators.
- **Complaint cards:** Admin and department dashboards present complaint information in organised cards.
- **Progress forms:** Department users can enter work updates and report completion.
- **Complaint details modal:** A focused view displays complaint information and progress history.
- **Notices:** Success and error messages communicate the result of user actions.

The admin dashboard uses complaint cards to present information and actions together. The department dashboard provides separate actions for viewing details, accepting assignments, updating progress, and marking work completed.

The application does not use map functionality.

## 6. Motion and interaction

Motion should communicate changes in application state and make interactions feel responsive without interfering with usability.

The original interface design included:

| Interaction | Intended behaviour |
|---|---|
| Page entrance | Content appears with a subtle rise and fade |
| Login and Register switch | Tabs and form content transition smoothly |
| Error messages | Messages appear without abrupt layout changes |
| Button hover | Buttons lift slightly and provide visual feedback |
| Complaint card hover | Cards provide a subtle response to pointer interaction |
| Background aura | Gradient elements move slowly and remain decorative |

Reduced-motion preferences should be respected. Important actions must remain usable without animation.

## 7. Accessibility considerations

The interface should follow these accessibility principles:

| Check | Design consideration |
|---|---|
| Text contrast | Maintain WCAG AA contrast for normal text |
| Form labels | Every input should have a visible label |
| Keyboard navigation | Actions should be reachable using the keyboard |
| Focus visibility | Interactive controls should have visible focus indicators |
| Error announcements | Errors should use appropriate alert semantics |
| Success announcements | Successful actions should be announced politely |
| Status indicators | Status should be communicated through text, not colour alone |
| Reduced motion | Respect the user's reduced-motion preference |
| Image descriptions | Provide meaningful alternative text for evidence images |
| Responsive layout | Keep dashboards usable on smaller screens |

These are design requirements; a complete accessibility audit should verify the current implementation with keyboard and screen-reader testing.

## 8. Heuristic evaluation (Nielsen's 10)

Severity scale: **0** = not a problem · **1** = cosmetic · **2** = minor · **3** = major · **4** = catastrophic.

| # | Heuristic | What works well | Issue / opportunity | Severity | Recommendation |
|---|---|---|---|---|---|
| 1 | Visibility of system status | Complaint status, dashboard statistics, notices and progress history | Citizens may need clearer feedback when a complaint is submitted or updated | 2 | Keep success notices visible and provide clear timeline updates |
| 2 | Match with the real world | Familiar complaint categories and department names | AI predictions may use terminology different from the citizen's category | 1 | Use consistent category labels throughout the application |
| 3 | User control and freedom | Users can log out; departments can submit progress; administrators can manage assignments | Citizens do not currently have a documented withdrawal or editing workflow | 2 | Consider a controlled complaint withdrawal or correction feature |
| 4 | Consistency and standards | Shared visual components, status labels and dashboard conventions | Legacy status terminology such as In Progress can cause confusion | 1 | Use Work in Progress consistently in the interface |
| 5 | Error prevention | Input validation and server-side checks | Incorrect department assignment can delay complaint handling | 2 | Make the assigned department clear and allow administrator reassignment |
| 6 | Recognition rather than recall | Complaint categories, visible actions and progress history | Users may not immediately understand the difference between Work Completed and Resolved | 2 | Explain that administrator verification is required before closure |
| 7 | Flexibility and efficiency | Role-specific dashboards and department-specific complaint lists | Search and sorting can improve complaint management as records grow | 2 | Add search by complaint ID or location and sorting by date or priority |
| 
