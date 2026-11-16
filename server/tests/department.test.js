// Department workflow: list, accept, progress, completion and scoping.
// STP cases TC-DEP-01 … TC-DEP-08.
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../app");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

let mongoServer;
let citizen;
let admin;
let roads;
let police;
let roadsToken;
let policeToken;
let adminToken;
let citizenToken;

const sign = (user) =>
  jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-key";
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Complaint.deleteMany({});
  await User.deleteMany({});

  citizen = await User.create({
    name: "Citizen",
    email: "citizen@example.com",
    password: "Password123",
  });
  admin = await User.create({
    name: "Admin",
    email: "admin@example.com",
    password: "Password123",
    role: "admin",
  });
  roads = await User.create({
    name: "Roads Department",
    email: "roads@example.com",
    password: "Password123",
    role: "department",
    department: "Roads & Maintenance",
  });
  police = await User.create({
    name: "Traffic Police",
    email: "police@example.com",
    password: "Password123",
    role: "department",
    department: "Traffic Police",
  });

  citizenToken = sign(citizen);
  adminToken = sign(admin);
  roadsToken = sign(roads);
  policeToken = sign(police);
});

function createComplaint(overrides = {}) {
  return Complaint.create({
    user: citizen._id,
    category: "Pothole",
    description: "Deep pothole near the bus stop",
    location: "MG Road",
    assignedDepartment: "Roads & Maintenance",
    departmentStatus: "Assigned",
    status: "Assigned to Department",
    ...overrides,
  });
}

const accept = (id, token = roadsToken) =>
  request(app)
    .patch(`/api/department/complaints/${id}/accept`)
    .set("Authorization", `Bearer ${token}`);

const progress = (id, body, token = roadsToken) =>
  request(app)
    .patch(`/api/department/complaints/${id}/progress`)
    .set("Authorization", `Bearer ${token}`)
    .send(body);

describe("Department authorization", () => {
  test("rejects requests without a token", async () => {
    const response = await request(app).get("/api/department/complaints");
    expect(response.status).toBe(401);
  });

  test("rejects a citizen", async () => {
    const response = await request(app)
      .get("/api/department/complaints")
      .set("Authorization", `Bearer ${citizenToken}`);
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Department access required");
  });

  test("rejects an administrator", async () => {
    const response = await request(app)
      .get("/api/department/complaints")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(403);
  });
});

describe("GET /api/department/complaints", () => {
  test("returns only complaints assigned to the user's department", async () => {
    await createComplaint({ description: "Roads complaint" });
    await createComplaint({
      description: "Police complaint",
      category: "Illegal Parking",
      assignedDepartment: "Traffic Police",
    });
    await createComplaint({
      description: "Unassigned complaint",
      assignedDepartment: null,
      departmentStatus: "Not Assigned",
      status: "Submitted",
    });

    const response = await request(app)
      .get("/api/department/complaints")
      .set("Authorization", `Bearer ${roadsToken}`);

    expect(response.status).toBe(200);
    expect(response.body.complaints).toHaveLength(1);
    expect(response.body.complaints[0].description).toBe("Roads complaint");
    expect(response.body.complaints[0].user.email).toBe("citizen@example.com");
    expect(response.body.complaints[0].user.password).toBeUndefined();
  });
});

describe("PATCH /api/department/complaints/:id/accept", () => {
  test("accepts an assigned complaint and records history", async () => {
    const complaint = await createComplaint();

    const response = await accept(complaint._id);

    expect(response.status).toBe(200);
    expect(response.body.complaint.departmentStatus).toBe("Accepted");
    expect(response.body.complaint.status).toBe("Accepted by Department");

    const saved = await Complaint.findById(complaint._id);
    expect(saved.progressUpdates).toHaveLength(1);
    expect(saved.progressUpdates[0].role).toBe("department");
    expect(saved.progressUpdates[0].updatedBy.toString()).toBe(
      roads._id.toString()
    );
  });

  test("rejects accepting the same complaint twice", async () => {
    const complaint = await createComplaint();
    await accept(complaint._id);

    const response = await accept(complaint._id);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/cannot be accepted/);
  });

  test("rejects an invalid complaint ID", async () => {
    const response = await accept("not-an-id");
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid complaint ID");
  });

  test("returns 404 for another department's complaint and leaves it unchanged", async () => {
    const complaint = await createComplaint();

    const response = await accept(complaint._id, policeToken);

    expect(response.status).toBe(404);
    const saved = await Complaint.findById(complaint._id);
    expect(saved.departmentStatus).toBe("Assigned");
  });
});

describe("PATCH /api/department/complaints/:id/progress", () => {
  test("rejects progress before the complaint is accepted", async () => {
    const complaint = await createComplaint();

    const response = await progress(complaint._id, { message: "Started" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Accept the complaint before posting progress"
    );
  });

  test("moves to Work in Progress, then Work Completed", async () => {
    const complaint = await createComplaint();
    await accept(complaint._id);

    const first = await progress(complaint._id, { message: "Crew on site" });
    expect(first.status).toBe(200);
    expect(first.body.complaint.status).toBe("Work in Progress");
    expect(first.body.complaint.departmentStatus).toBe("Work in Progress");

    const second = await progress(complaint._id, {
      message: "Pothole filled",
      status: "Work Completed",
    });
    expect(second.status).toBe(200);
    expect(second.body.complaint.status).toBe("Work Completed");
    expect(second.body.complaint.departmentStatus).toBe("Work Completed");

    const saved = await Complaint.findById(complaint._id);
    expect(saved.progressUpdates.map((u) => u.message)).toEqual([
      "Department accepted the complaint assignment.",
      "Crew on site",
      "Pothole filled",
    ]);
  });

  test.each([
    ["an empty message", { message: "   " }],
    ["a missing message", {}],
    ["a message over 1,000 characters", { message: "a".repeat(1001) }],
  ])("rejects %s", async (_label, body) => {
    const complaint = await createComplaint();
    await accept(complaint._id);

    const response = await progress(complaint._id, body);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/up to 1000 characters/);
  });

  test("accepts a message of exactly 1,000 characters", async () => {
    const complaint = await createComplaint();
    await accept(complaint._id);

    const response = await progress(complaint._id, {
      message: "a".repeat(1000),
    });

    expect(response.status).toBe(200);
  });

  test("rejects a department trying to set Resolved", async () => {
    const complaint = await createComplaint();
    await accept(complaint._id);

    const response = await progress(complaint._id, {
      message: "Done",
      status: "Resolved",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid department progress status");
  });

  test("rejects an invalid complaint ID", async () => {
    const response = await progress("abc", { message: "x" });
    expect(response.status).toBe(400);
  });

  test("returns 404 for another department's complaint", async () => {
    const complaint = await createComplaint({
      departmentStatus: "Accepted",
    });

    const response = await progress(
      complaint._id,
      { message: "Not ours" },
      policeToken
    );

    expect(response.status).toBe(404);
    const saved = await Complaint.findById(complaint._id);
    expect(saved.progressUpdates).toHaveLength(0);
  });
});

describe("Department cannot use administrator routes", () => {
  test("a department cannot resolve a complaint through the admin API", async () => {
    const complaint = await createComplaint({
      departmentStatus: "Work Completed",
      status: "Work Completed",
    });

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${roadsToken}`)
      .send({ status: "Resolved" });

    expect(response.status).toBe(403);
    const saved = await Complaint.findById(complaint._id);
    expect(saved.status).toBe("Work Completed");
  });
});
