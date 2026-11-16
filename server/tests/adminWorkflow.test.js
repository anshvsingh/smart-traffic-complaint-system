// Administrator department management, assignment and resolution.
// STP cases TC-ADM-02 … TC-ADM-06 and TC-ADM-09.
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
  await User.create({
    name: "Roads Department",
    email: "roads@example.com",
    password: "Password123",
    role: "department",
    department: "Roads & Maintenance",
  });
  await User.create({
    name: "Traffic Police",
    email: "police@example.com",
    password: "Password123",
    role: "department",
    department: "Traffic Police",
  });

  adminToken = sign(admin);
  citizenToken = sign(citizen);
});

const createComplaint = (overrides = {}) =>
  Complaint.create({
    user: citizen._id,
    category: "Pothole",
    description: "Pothole on the flyover",
    location: "Ring Road",
    ...overrides,
  });

const createDepartment = (body, token = adminToken) =>
  request(app)
    .post("/api/admin/departments")
    .set("Authorization", `Bearer ${token}`)
    .send(body);

const assign = (id, body) =>
  request(app)
    .patch(`/api/admin/complaints/${id}/assign`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);

const validDepartment = {
  name: "Electrical Department",
  email: "Electrical@Example.com",
  password: "Password123",
  department: "Electrical Department",
};

describe("POST /api/admin/departments", () => {
  test("creates a department account", async () => {
    const response = await createDepartment(validDepartment);

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("department");
    expect(response.body.user.email).toBe("electrical@example.com");
    expect(response.body.user.password).toBeUndefined();

    const saved = await User.findOne({ email: "electrical@example.com" }).select(
      "+password"
    );
    expect(saved.password).toMatch(/^\$2/);
  });

  test.each(["name", "email", "password", "department"])(
    "rejects a missing %s",
    async (field) => {
      const body = { ...validDepartment };
      delete body[field];

      const response = await createDepartment(body);

      expect(response.status).toBe(400);
    }
  );

  test("rejects a password shorter than 8 characters", async () => {
    const response = await createDepartment({
      ...validDepartment,
      password: "short7!",
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/at least 8 characters/);
  });

  test("rejects a duplicate email", async () => {
    await createDepartment(validDepartment);
    const response = await createDepartment(validDepartment);
    expect(response.status).toBe(409);
  });

  test("rejects a citizen", async () => {
    const response = await createDepartment(validDepartment, citizenToken);
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/admin/complaints/:id/assign", () => {
  test("assigns a complaint to an existing department", async () => {
    const complaint = await createComplaint();

    const response = await assign(complaint._id, {
      department: "Roads & Maintenance",
    });

    expect(response.status).toBe(200);
    expect(response.body.complaint.assignedDepartment).toBe(
      "Roads & Maintenance"
    );
    expect(response.body.complaint.departmentStatus).toBe("Assigned");
    expect(response.body.complaint.status).toBe("Assigned to Department");
    expect(response.body.complaint.progressUpdates).toHaveLength(1);
  });

  test("accepts the alternative field name assignedDepartment", async () => {
    const complaint = await createComplaint();

    const response = await assign(complaint._id, {
      assignedDepartment: "Traffic Police",
    });

    expect(response.status).toBe(200);
    expect(response.body.complaint.assignedDepartment).toBe("Traffic Police");
  });

  test("reassigns a complaint and records the previous department", async () => {
    const complaint = await createComplaint();
    await assign(complaint._id, { department: "Roads & Maintenance" });

    const response = await assign(complaint._id, {
      department: "Traffic Police",
    });

    expect(response.status).toBe(200);
    expect(response.body.complaint.assignedDepartment).toBe("Traffic Police");
    expect(response.body.complaint.departmentStatus).toBe("Assigned");
    const history = response.body.complaint.progressUpdates;
    expect(history).toHaveLength(2);
    expect(history[1].message).toMatch(/Roads & Maintenance/);
  });

  test("returns 404 when no account exists for the department", async () => {
    const complaint = await createComplaint();

    const response = await assign(complaint._id, {
      department: "Water Department",
    });

    expect(response.status).toBe(404);
    const saved = await Complaint.findById(complaint._id);
    expect(saved.assignedDepartment).toBeNull();
  });

  test("rejects a missing department", async () => {
    const complaint = await createComplaint();
    const response = await assign(complaint._id, { department: "  " });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Department name is required");
  });

  test("rejects an invalid complaint ID", async () => {
    const response = await assign("bad-id", {
      department: "Traffic Police",
    });
    expect(response.status).toBe(400);
  });

  test("returns 404 when the complaint does not exist", async () => {
    const response = await assign(new mongoose.Types.ObjectId(), {
      department: "Traffic Police",
    });
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Complaint not found");
  });
});

describe("Administrator resolution", () => {
  test("setting Resolved also marks the department work completed", async () => {
    const complaint = await createComplaint({
      assignedDepartment: "Roads & Maintenance",
      departmentStatus: "Work in Progress",
      status: "Work in Progress",
    });

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Resolved" });

    expect(response.status).toBe(200);
    expect(response.body.complaint.status).toBe("Resolved");
    expect(response.body.complaint.departmentStatus).toBe("Work Completed");
    const last = response.body.complaint.progressUpdates.at(-1);
    expect(last.message).toMatch(/Resolved/);
    expect(last.role).toBe("admin");
  });
});
