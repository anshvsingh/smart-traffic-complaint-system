const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../app");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

let mongoServer;
let citizen;
let otherCitizen;
let token;
let otherToken;

beforeAll(async () => {
  process.env.JWT_SECRET = "test-only-secret-for-automated-tests";

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {
    serverSelectionTimeoutMS: 5000,
  });
}, 60000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Complaint.deleteMany({}),
  ]);

  citizen = await User.create({
    name: "Test Citizen",
    email: "citizen@example.com",
    password: "Password123",
  });

  otherCitizen = await User.create({
    name: "Other Citizen",
    email: "other@example.com",
    password: "Password123",
  });

  token = jwt.sign(
    { sub: citizen._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  otherToken = jwt.sign(
    { sub: otherCitizen._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe("POST /api/complaints", () => {
  it("creates a complaint for the logged-in citizen", async () => {
    const response = await request(app)
      .post("/api/complaints")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "Traffic Signal",
        description: "A vehicle crossed a red light",
        location: "MG Road",
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.complaint.category).toBe("Traffic Signal");
    expect(response.body.complaint.user).toBe(citizen._id.toString());

    const saved = await Complaint.findById(response.body.complaint._id);
    expect(saved).not.toBeNull();
  });

  it("rejects missing complaint fields", async () => {
    const response = await request(app)
      .post("/api/complaints")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Traffic Signal" });

    expect(response.status).toBe(400);
  });

  it("rejects an invalid complaint category", async () => {
    const response = await request(app)
      .post("/api/complaints")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "Not A Valid Category",
        description: "Test description",
        location: "MG Road",
      });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/complaints", () => {
  it("returns only complaints belonging to the logged-in citizen", async () => {
    await Complaint.create({
      user: citizen._id,
      category: "Traffic Signal",
      description: "Citizen complaint",
      location: "MG Road",
    });

    await Complaint.create({
      user: otherCitizen._id,
      category: "Illegal Parking",
      description: "Other citizen complaint",
      location: "Brigade Road",
    });

    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.complaints[0].description).toBe("Citizen complaint");
  });

  it("returns an empty list when the citizen has no complaints", async () => {
    const response = await request(app)
      .get("/api/complaints")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
    expect(response.body.complaints).toEqual([]);
  });
});

describe("GET /api/complaints/:id", () => {
  it("returns a complaint owned by the logged-in citizen", async () => {
    const complaint = await Complaint.create({
      user: citizen._id,
      category: "Traffic Signal",
      description: "Test complaint",
      location: "MG Road",
    });

    const response = await request(app)
      .get(`/api/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.complaint.description).toBe("Test complaint");
  });

  it("rejects an invalid complaint ID", async () => {
    const response = await request(app)
      .get("/api/complaints/not-an-object-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
  });

  it("does not reveal another citizen's complaint", async () => {
    const complaint = await Complaint.create({
      user: otherCitizen._id,
      category: "Illegal Parking",
      description: "Private complaint",
      location: "Brigade Road",
    });

    const response = await request(app)
      .get(`/api/complaints/${complaint._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});
