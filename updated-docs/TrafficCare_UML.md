# UML Diagrams

## TrafficCare: Smart Traffic Complaint and Monitoring System

| Item | Value |
|---|---|
| Document | UML Design Diagrams |
| Version | 2.0 |
| Date | 16 November 2026 |
| Notation | UML 2.5 semantics, drawn with Mermaid (editable sources in `uml/`) |
| Related documents | TrafficCare_SRS, TrafficCare_SAD, TrafficCare_STP |

### Revision history

| Version | Date | Description |
|---|---|---|
| 1.0 | 14 Nov 2026 | Use case, one sequence, state and class diagrams |
| 2.0 | 16 Nov 2026 | Full set of structural and behavioural diagrams: use case with descriptions, class, component, deployment, five sequence diagrams, activity, two state machines and the ML pipeline |

### Diagram index

| # | Diagram | UML type | Source file |
|---|---|---|---|
| 1 | Use case diagram | Behavioural | `uml/use-case.png` (Mermaid: `uml/use-case.mmd`) |
| 2 | Domain class diagram | Structural | `uml/domain-class.mmd` |
| 3 | Backend design class diagram | Structural | `uml/backend-class.mmd` |
| 4 | Component diagram | Structural | `uml/component.mmd` |
| 5 | Deployment diagram | Structural | `uml/deployment.mmd` |
| 6 | Sequence: login | Interaction | `uml/login-sequence.mmd` |
| 7 | Sequence: submit complaint with image | Interaction | `uml/complaint-sequence.mmd` |
| 8 | Sequence: assign complaint | Interaction | `uml/assign-sequence.mmd` |
| 9 | Sequence: department progress and admin resolution | Interaction | `uml/department-sequence.mmd` |
| 10 | Sequence: DL prediction | Interaction | `uml/prediction-sequence.mmd` |
| 11 | Activity: complaint handling end-to-end | Behavioural | `uml/complaint-activity.mmd` |
| 12 | State machine: complaint status | Behavioural | `uml/complaint-state.mmd` |
| 13 | State machine: department status | Behavioural | `uml/department-state.mmd` |
| 14 | Activity: ML / DL / QML experiment pipeline | Behavioural | `uml/ml-pipeline-activity.mmd` |

---

## 1. Use Case Diagram

![Use case diagram](uml/use-case.png)

An editable Mermaid version of the same diagram is in `uml/use-case.mmd`.

### 1.1 Use case descriptions

| ID | Use case | Actor | Pre-condition | Main flow | Alternative / exception | Post-condition |
|---|---|---|---|---|---|---|
| UC1 | Register | Citizen | Not signed in | Enter name, e-mail, password → account created | Invalid data → 400; duplicate e-mail → 409 | Citizen account exists |
| UC2 | Sign in / out | All | Account exists | Enter credentials → JWT issued → role dashboard opens; logout clears local session | Wrong credentials → generic 401 | Session started / ended |
| UC3 | Submit complaint | Citizen | Signed in | Choose category, describe, give location, submit | Missing/invalid field → 400 | Complaint `Submitted` |
| UC4 | Attach photo | Citizen | In UC3 | Choose JPEG/PNG ≤ 10 MB | Wrong type/size → 400 | Image stored |
| UC5 | Classify photo | DL service | Image attached | Backend posts image → class + confidence returned | Service down/timeout → AI `Failed`, complaint still saved | AI result stored |
| UC6 | Track own complaints | Citizen | Signed in | View list, status, AI result, progress history | None | none |
| UC7 | Review all complaints | Admin | Signed in as admin | View every complaint with reporter and history | None | none |
| UC8 | Set status / priority | Admin | UC7 | Choose status and/or priority → saved, history entry added | Invalid value → 400 | Status/priority updated |
| UC9 | Assign department | Admin | UC7 | Choose department → assigned, history entry added | No such department → 404 | `Assigned to Department` |
| UC10 | Create department account | Admin | Signed in as admin | Enter name, e-mail, password, department | Duplicate → 409 | Department user exists |
| UC11 | View statistics | Admin | Signed in as admin | See total and count per status | None | none |
| UC12 | Resolve or reject | Admin | Work completed (resolve) or under review (reject) | Set `Resolved` / `Rejected` | None | Complaint closed |
| UC13 | View assigned complaints | Department | Signed in as department | See own department's complaints | None | none |
| UC14 | Accept assignment | Department | Status `Assigned` | Accept → history entry | Not in `Assigned` → 400 | `Accepted by Department` |
| UC15 | Post progress / complete | Department | Accepted | Write message, optionally mark Work Completed | Not accepted → 400 | `Work in Progress` or `Work Completed` |

---

## 2. Domain Class Diagram

```mermaid
classDiagram
  direction LR
  class User {
    +ObjectId _id
    +String name
    +String email
    -String password
    +Role role
    +String department
    +Date createdAt
    +Date updatedAt
    +comparePassword(candidate) Promise~Boolean~
  }
  class Complaint {
    +ObjectId _id
    +ObjectId user
    +Category category
    +String description
    +String location
    +String imageUrl
    +ComplaintStatus status
    +String assignedDepartment
    +DepartmentStatus departmentStatus
    +Priority priority
    +Date createdAt
    +Date updatedAt
  }
  class AIPrediction {
    +PredictionStatus status
    +String category
    +Number confidence
    +Map probabilities
  }
  class ProgressUpdate {
    +ObjectId updatedBy
    +Role role
    +String message
    +String status
    +Date createdAt
  }
  class Role {
    <<enumeration>>
    citizen
    admin
    department
  }
  class Priority {
    <<enumeration>>
    Low
    Medium
    High
  }
  class PredictionStatus {
    <<enumeration>>
    Not Requested
    Completed
    Failed
  }
  class DepartmentStatus {
    <<enumeration>>
    Not Assigned
    Assigned
    Accepted
    Work in Progress
    Work Completed
  }
  User "1" --> "0..*" Complaint : submits
  Complaint "1" *-- "1" AIPrediction
  Complaint "1" *-- "0..*" ProgressUpdate
  User "1" --> "0..*" ProgressUpdate : authors
  User ..> Role
  Complaint ..> Priority
  Complaint ..> DepartmentStatus
  AIPrediction ..> PredictionStatus
```

`ComplaintStatus` has nine values (SRS Appendix A) and `Category` has eleven (FR-CMP-02); they are omitted from the drawing for readability.

---

## 3. Backend Design Class Diagram

```mermaid
classDiagram
  direction TB
  class App {
    <<module app.js>>
    +cors(origin)
    +json()
    +static("/uploads", nosniff)
    +notFoundHandler()
    +errorHandler()
  }
  class AuthMiddleware {
    <<module>>
    +protect(req, res, next)
    +requireAdmin(req, res, next)
    +requireDepartment(req, res, next)
  }
  class AuthRoutes {
    <<router /api/auth>>
    +POST register()
    +POST login()
  }
  class ComplaintRoutes {
    <<router /api/complaints>>
    -upload : Multer
    +POST create()
    +GET listOwn()
    +GET getOwn(id)
    -removeUploadedFile(file)
  }
  class AdminRoutes {
    <<router /api/admin>>
    +POST createDepartment()
    +GET listAll()
    +PATCH assign(id)
    +PATCH update(id)
    +GET dashboard()
  }
  class DepartmentRoutes {
    <<router /api/department>>
    +GET listAssigned()
    +PATCH accept(id)
    +PATCH progress(id)
  }
  class DLClient {
    <<inside ComplaintRoutes>>
    +predict(image) AIPrediction
  }
  class UserModel {
    <<Mongoose model>>
  }
  class ComplaintModel {
    <<Mongoose model>>
  }
  class SeedDepartments {
    +seedDepartments()
  }
  App --> AuthRoutes
  App --> ComplaintRoutes
  App --> AdminRoutes
  App --> DepartmentRoutes
  ComplaintRoutes ..> AuthMiddleware : protect
  AdminRoutes ..> AuthMiddleware : protect + requireAdmin
  DepartmentRoutes ..> AuthMiddleware : protect + requireDepartment
  ComplaintRoutes --> DLClient
  AuthRoutes --> UserModel
  AuthMiddleware --> UserModel
  AdminRoutes --> UserModel
  AdminRoutes --> ComplaintModel
  ComplaintRoutes --> ComplaintModel
  DepartmentRoutes --> ComplaintModel
  SeedDepartments --> UserModel
```

---

## 4. Component Diagram

```mermaid
flowchart LR
  subgraph Client["«component» Web Client (React)"]
    UIAuth["Auth & routing"]
    UICit["Citizen dashboard"]
    UIAdm["Admin dashboard"]
    UIDep["Department dashboard"]
  end
  subgraph Backend["«component» Backend API (Express)"]
    IREST(("REST /api"))
    CAuth["Auth"]
    CCmp["Complaints"]
    CAdm["Admin"]
    CDep["Department"]
    CMod["Models"]
  end
  subgraph DLSvc["«component» DL Service (FastAPI)"]
    IPred(("/predict"))
    CInf["Inference"]
    CModel["ResNet18 checkpoint"]
  end
  DB[("«component» MongoDB")]
  FS[("«artifact» uploads/")]
  UIAuth & UICit & UIAdm & UIDep -->|requires| IREST
  IREST --- CAuth & CCmp & CAdm & CDep
  CAuth & CCmp & CAdm & CDep --> CMod --> DB
  CCmp --> FS
  CCmp -->|requires| IPred
  IPred --- CInf --> CModel
```

---

## 5. Deployment Diagram

```mermaid
flowchart TB
  subgraph Device["«device» User device"]
    Browser["«execution env» Web browser<br/>React SPA"]
  end
  subgraph Node["«device» Host: Docker Desktop"]
    subgraph Cluster["«execution env» Kubernetes cluster"]
      FEPod["«pod» frontend<br/>node:24-alpine · :5173"]
      BEPod["«pod» backend<br/>node:24-alpine · :5050"]
      DLPod["«pod» dl<br/>python:3.11-slim · :8000"]
      Secret["«secret» trafficcare-secrets"]
    end
  end
  subgraph Cloud["«device» MongoDB Atlas"]
    Mongo[("«database» trafficcare")]
  end
  Registry["«registry» Docker Hub"]
  Browser -->|HTTP via port-forward| FEPod
  Browser -->|HTTP REST via port-forward| BEPod
  BEPod -->|"HTTP http://dl:8000"| DLPod
  BEPod -->|"TLS / MongoDB protocol"| Mongo
  Secret -.-> BEPod
  Registry -. image pull .-> FEPod & BEPod & DLPod
```

---

## 6. Sequence Diagram: Login

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant UI as React client
  participant API as AuthRoutes
  participant DB as MongoDB
  U->>UI: Enter e-mail and password
  UI->>API: POST /api/auth/login
  API->>API: Type-check inputs
  alt Invalid input
    API-->>UI: 400 Email and password are required
  else Valid input
    API->>DB: findOne(email lower-case) + password
    DB-->>API: user or null
    alt User missing or bcrypt mismatch
      API-->>UI: 401 Invalid email or password
    else Match
      API->>API: jwt.sign({role}, secret, sub=id, 1h)
      API-->>UI: 200 {token, user}
      UI->>UI: Save token and user in localStorage
      UI-->>U: Show dashboard for user.role
    end
  end
```

---

## 7. Sequence Diagram: Submit Complaint with Image

```mermaid
sequenceDiagram
  autonumber
  actor C as Citizen
  participant UI as React client
  participant API as ComplaintRoutes
  participant MW as protect
  participant M as Multer
  participant DL as DL service
  participant DB as MongoDB
  C->>UI: Fill form and attach photo
  UI->>API: POST /api/complaints (multipart, Bearer JWT)
  API->>MW: Verify token, load user
  MW-->>API: req.user
  API->>M: Save image as uuid.jpg/png
  alt Wrong type or > 10 MB
    M-->>UI: 400 image error
  else Stored
    API->>API: Validate fields and category
    alt Invalid
      API->>API: Delete stored image
      API-->>UI: 400 validation message
    else Valid
      API->>DL: POST /predict (30 s timeout)
      alt Success
        DL-->>API: category, confidence, probabilities
      else Failure or timeout
        API->>API: aiPrediction.status = Failed
      end
      API->>DB: Complaint.create
      DB-->>API: complaint
      API-->>UI: 201 complaint
      UI-->>C: Show confirmation, status Submitted
    end
  end
```

---

## 8. Sequence Diagram: Assign Complaint

```mermaid
sequenceDiagram
  autonumber
  actor A as Administrator
  participant UI as Admin dashboard
  participant API as AdminRoutes
  participant DB as MongoDB
  A->>UI: Choose department, click Assign
  UI->>API: PATCH /api/admin/complaints/:id/assign {department}
  API->>API: protect + requireAdmin, validate id and department
  API->>DB: User.findOne(role=department, department)
  alt No department account
    API-->>UI: 404 No account found
  else Found
    API->>DB: Complaint.findById(id)
    API->>API: assignedDepartment, departmentStatus=Assigned, status=Assigned to Department, push progress
    API->>DB: complaint.save()
    API-->>UI: 200 complaint
    UI-->>A: Card shows new department and status
  end
```

---

## 9. Sequence Diagram: Department Progress and Admin Resolution

```mermaid
sequenceDiagram
  autonumber
  actor D as Department user
  actor A as Administrator
  participant API as Backend API
  participant DB as MongoDB
  D->>API: PATCH /department/complaints/:id/accept
  API->>DB: findOne(id, assignedDepartment = mine)
  alt departmentStatus is Assigned
    API->>DB: save Accepted / Accepted by Department + progress
    API-->>D: 200
  else other state
    API-->>D: 400
  end
  D->>API: PATCH …/progress {message}
  API->>DB: save Work in Progress + progress
  API-->>D: 200
  D->>API: PATCH …/progress {message, status: Work Completed}
  API->>DB: save Work Completed + progress
  API-->>D: 200
  A->>API: PATCH /admin/complaints/:id {status: Resolved}
  API->>DB: save Resolved, departmentStatus Work Completed + progress
  API-->>A: 200
```

---

## 10. Sequence Diagram: DL Prediction

```mermaid
sequenceDiagram
  autonumber
  participant BE as Backend
  participant API as FastAPI /predict
  participant PIL as Pillow
  participant T as Transform
  participant M as ResNet18
  BE->>API: multipart file
  API->>API: Check content type (jpeg/png)
  API->>API: Read up to 10 MB + 1 byte
  alt Wrong type / empty
    API-->>BE: 400
  else Too large
    API-->>BE: 413
  else OK
    API->>PIL: open and convert to RGB
    alt Corrupted
      API-->>BE: 400
    else Valid
      API->>T: Resize 224, ToTensor, Normalize
      T->>M: forward (no_grad)
      M-->>API: logits
      API->>API: softmax, arg-max, map to display name
      API-->>BE: 200 {success, prediction}
    end
  end
```

---

## 11. Activity Diagram: Complaint Handling End-to-End

```mermaid
flowchart TB
  subgraph Citizen
    S((Start)) --> A1[Fill complaint form]
    A1 --> A2{Photo attached?}
    A2 -- yes --> A3[Attach JPEG/PNG]
    A2 -- no --> A4[Submit]
    A3 --> A4
    Z1[View status and history]
  end
  subgraph System
    A4 --> B1{Valid?}
    B1 -- no --> B2[Return error] --> A1
    B1 -- yes --> B3{Image?}
    B3 -- yes --> B4[Call DL service] --> B5[Store AI result or Failed]
    B3 -- no --> B6[Save complaint: Submitted]
    B5 --> B6
  end
  subgraph Administrator
    B6 --> C1[Review complaint]
    C1 --> C2{Valid complaint?}
    C2 -- no --> C3[Set Rejected]
    C2 -- yes --> C4[Set priority and assign department]
    C6{Work verified?}
    C6 -- yes --> C7[Set Resolved]
    C6 -- no --> C4
  end
  subgraph Department
    C4 --> D1[Accept assignment]
    D1 --> D2[Post progress]
    D2 --> D3{Work finished?}
    D3 -- no --> D2
    D3 -- yes --> D4[Mark Work Completed]
    D4 --> C6
  end
  C3 --> Z1
  C7 --> Z1
  Z1 --> E((End))
```

---

## 12. State Machine: Complaint Status

```mermaid
stateDiagram-v2
  [*] --> Submitted : citizen submits
  Submitted --> UnderReview : admin reviews
  Submitted --> AssignedToDepartment : admin assigns
  UnderReview --> AssignedToDepartment : admin assigns
  AssignedToDepartment --> AssignedToDepartment : admin reassigns
  AssignedToDepartment --> AcceptedByDepartment : department accepts
  AcceptedByDepartment --> WorkInProgress : department posts progress
  WorkInProgress --> WorkInProgress : more progress
  AcceptedByDepartment --> WorkCompleted : department completes
  WorkInProgress --> WorkCompleted : department completes
  WorkCompleted --> Resolved : admin verifies
  WorkCompleted --> AssignedToDepartment : admin reassigns (rework)
  Submitted --> Rejected : admin rejects
  UnderReview --> Rejected : admin rejects
  Resolved --> [*]
  Rejected --> [*]
```

The server does not enforce this order for administrators: an admin may set any of the nine values. The diagram shows the intended workflow (SRS §3.5). The legacy `In Progress` value is not part of the new workflow.

---

## 13. State Machine: Department Status

```mermaid
stateDiagram-v2
  [*] --> NotAssigned
  NotAssigned --> Assigned : admin assigns
  Assigned --> Assigned : admin reassigns
  Assigned --> Accepted : accept [departmentStatus = Assigned]
  Accepted --> WorkInProgress : progress
  WorkInProgress --> WorkInProgress : progress
  Accepted --> WorkCompleted : progress(Work Completed)
  WorkInProgress --> WorkCompleted : progress(Work Completed)
  WorkCompleted --> Assigned : admin reassigns
  NotAssigned --> WorkCompleted : admin sets Resolved
  WorkCompleted --> [*]
```

---

## 14. Activity Diagram: ML / DL / QML Experiment Pipeline

```mermaid
flowchart TB
  S((Start)) --> P1[Download CPRD dataset]
  P1 --> P2[Cut 128×128 patches, label from masks]
  P2 --> P3[Group split by 500 m road stretch: 900 train / 300 test]
  P3 --> F1[Extract 16 texture/colour features]
  P3 --> I1[Export image patches]
  F1 --> F2[Scale + PCA → 8 angles]
  F1 --> ML[Train LogReg, SVM-RBF, Random Forest<br/>GroupKFold CV]
  F2 --> Q1[Train VQC and QSVM<br/>NumPy simulator / PennyLane]
  F2 --> Q2[Train feature QNN + classical control]
  I1 --> D1[Fine-tune ResNet18, EfficientNet-B0, MobileNetV3-L<br/>3 seeds, early stopping on val F1]
  I1 --> Q3[Train hybrid ResNet18 + quantum layer + classical control]
  ML & Q1 & Q2 & D1 & Q3 --> E1[Evaluate on the same 300 test patches]
  E1 --> E2[Metrics JSON, confusion matrices, McNemar, comparison tables]
  E2 --> E3{Better than served model and significant?}
  E3 -- yes --> E4[Export checkpoint, set DL_MODEL_PATH]
  E3 -- no --> E5[Keep ResNet18 in production]
  E4 --> X((End))
  E5 --> X
```
