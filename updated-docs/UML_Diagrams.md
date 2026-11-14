# UML Diagrams — TrafficCare

**Version:** 1.0 · **Date:** 14 November 2026

These diagrams describe the current repository behavior. Editable Mermaid sources are in `uml/`.

## Use case diagram

```mermaid
flowchart LR
  Citizen([Citizen])
  Admin([Administrator])
  Dept([Department user])
  UC1((Register / sign in))
  UC2((Submit complaint))
  UC3((Attach image / request AI classification))
  UC4((View own complaints))
  UC5((Review all complaints))
  UC6((Manage department accounts))
  UC7((Assign complaint))
  UC8((Set status / priority))
  UC9((View dashboard counts))
  UC10((View assigned complaints))
  UC11((Accept assignment))
  UC12((Post progress / complete work))
  Citizen --> UC1
  Citizen --> UC2
  Citizen --> UC4
  UC2 -. optional .-> UC3
  Admin --> UC1
  Admin --> UC5
  Admin --> UC6
  Admin --> UC7
  Admin --> UC8
  Admin --> UC9
  Dept --> UC1
  Dept --> UC10
  Dept --> UC11
  Dept --> UC12
```

## Sequence: submit complaint with image

```mermaid
sequenceDiagram
  actor Citizen
  participant UI as React Client
  participant API as Express API
  participant Auth as JWT Middleware
  participant DL as FastAPI / ResNet18
  participant DB as MongoDB
  Citizen->>UI: Enter category, description, location, image
  UI->>API: POST /api/complaints (multipart + bearer JWT)
  API->>Auth: Verify token and load user
  Auth-->>API: Authorized citizen
  API->>API: Validate fields and image constraints
  opt Image attached
    API->>DL: POST /predict (image)
    alt Prediction succeeds
      DL-->>API: category, confidence, probabilities
    else Prediction errors / times out
      DL-->>API: error or no response
      API->>API: Set AI status Failed; continue
    end
  end
  API->>DB: Create complaint with owner, defaults, prediction result
  DB-->>API: Persisted complaint
  API-->>UI: 201 success + complaint
  UI-->>Citizen: Show confirmation and tracking state
```

## State machine: complaint lifecycle

```mermaid
stateDiagram-v2
  [*] --> Submitted
  Submitted --> UnderReview: administrator reviews
  UnderReview --> Assigned: administrator assigns department
  Submitted --> Assigned: administrator assigns directly
  Assigned --> Accepted: department accepts
  Accepted --> InProgress: department posts progress
  InProgress --> WorkCompleted: department completes work
  WorkCompleted --> Resolved: administrator resolves
  Submitted --> Rejected: administrator rejects
  UnderReview --> Rejected: administrator rejects
  Assigned --> Assigned: administrator reassigns
```

The implementation stores complaint status and department status separately. The diagram summarizes common flow; administrators can update complaint status directly among allowed values.

## Class / domain model

```mermaid
classDiagram
  class User {
    +ObjectId id
    +string name
    +string email
    +string password
    +Role role
    +string department
  }
  class Complaint {
    +ObjectId id
    +ObjectId user
    +string category
    +string description
    +string location
    +string imageUrl
    +ComplaintStatus status
    +string assignedDepartment
    +DepartmentStatus departmentStatus
    +Priority priority
  }
  class AIPrediction {
    +PredictionStatus status
    +string category
    +number confidence
    +object probabilities
  }
  class ProgressUpdate {
    +ObjectId updatedBy
    +Role role
    +string message
    +string status
    +Date createdAt
  }
  User "1" --> "0..*" Complaint : submits
  Complaint "1" *-- "0..1" AIPrediction
  Complaint "1" *-- "0..*" ProgressUpdate
  User "1" --> "0..*" ProgressUpdate : authors
```

## Sources

- `uml/use-case.mmd`
- `uml/complaint-sequence.mmd`
- `uml/complaint-state.mmd`
- `uml/domain-class.mmd`
