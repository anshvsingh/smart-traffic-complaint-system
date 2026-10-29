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
let citizenToken;
let adminToken;

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
    name: "Test Citizen",
    email: "citizen@example.com",
    password: "Password123!",
    role: "citizen",
  });

  admin = await User.create({
    name: "Test Admin",
    email: "admin@example.com",
    password: "Password123!",
    role: "admin",
  });

  citizenToken = jwt.sign(
    { sub: citizen._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  adminToken = jwt.sign(
    { sub: admin._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

async function createComplaint(overrides = {}) {
  return Complaint.create({
    user: citizen._id,
    category: "Pothole",
    description: "A pothole near the main road",
    location: "Bengaluru",
    ...overrides,
  });
}

describe("Admin authorization", () => {
  test("rejects requests without a token", async () => {
    const response = await request(app).get("/api/admin/complaints");
    expect(response.status).toBe(401);
  });

  test("rejects a citizen accessing admin routes", async () => {
    const response = await request(app)
      .get("/api/admin/complaints")
      .set("Authorization", `Bearer ${citizenToken}`);

    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/complaints", () => {
  test("returns all complaints with count and user details", async () => {
    await createComplaint();
    await createComplaint({
      category: "Traffic Signal",
      description: "Signal not working",
      location: "Mysuru Road",
    });

    const response = await request(app)
      .get("/api/admin/complaints")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.count).toBe(2);
    expect(response.body.complaints).toHaveLength(2);
    expect(response.body.complaints[0].user.email).toBe(
      "citizen@example.com"
    );
  });

  test("returns an empty list when no complaints exist", async () => {
    const response = await request(app)
      .get("/api/admin/complaints")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
    expect(response.body.complaints).toEqual([]);
  });
});

describe("PATCH /api/admin/complaints/:id", () => {
  test("updates complaint status and priority", async () => {
    const complaint = await createComplaint();

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "In Progress", priority: "High" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.complaint.status).toBe("In Progress");
    expect(response.body.complaint.priority).toBe("High");
  });

  test("updates only the status when priority is omitted", async () => {
    const complaint = await createComplaint();

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Resolved" });

    expect(response.status).toBe(200);
    expect(response.body.complaint.status).toBe("Resolved");
    expect(response.body.complaint.priority).toBe("Medium");
  });

  test("rejects an invalid complaint ID", async () => {
    const response = await request(app)
      .patch("/api/admin/complaints/not-an-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Resolved" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid complaint ID");
  });

  test("rejects an empty update", async () => {
    const complaint = await createComplaint();

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Provide a status or priority to update"
    );
  });

  test("rejects an invalid status", async () => {
    const complaint = await createComplaint();

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Fake Status" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid complaint status");
  });

  test("rejects an invalid priority", async () => {
    const complaint = await createComplaint();

    const response = await request(app)
      .patch(`/api/admin/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ priority: "Urgent" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid complaint priority");
  });

  test("returns 404 when the complaint does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(`/api/admin/complaints/${missingId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Resolved" });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Complaint not found");
  });
});

describe("GET /api/admin/dashboard", () => {
  test("returns total complaints and counts grouped by status", async () => {
    await createComplaint({ status: "Submitted" });
    await createComplaint({
      status: "In Progress",
      description: "Traffic signal issue",
    });
    await createComplaint({
      status: "Resolved",
      description: "Road damage",
    });

    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.total).toBe(3);
    expect(response.body.byStatus.Submitted).toBe(1);
    expect(response.body.byStatus["In Progress"]).toBe(1);
    expect(response.body.byStatus.Resolved).toBe(1);
  });

  test("returns zero total when there are no complaints", async () => {
    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.byStatus).toEqual({});
  });
});
