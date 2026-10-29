
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../app");
const User = require("../models/User");

let mongoServer;


beforeAll(async () => {
  process.env.JWT_SECRET = "test-only-secret-for-automated-tests";

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), {
     serverSelectionTimeoutMS: 10000,
});
  
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("POST /api/auth/register", () => {
  it("registers a citizen successfully", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Test Citizen",
        email: "CITIZEN@example.com",
        password: "Password123",
        role: "admin",
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.user.email).toBe("citizen@example.com");
    expect(response.body.user.role).toBe("citizen");

    const savedUser = await User.findOne({
      email: "citizen@example.com",
    }).select("+password");

    expect(savedUser).not.toBeNull();
    expect(savedUser.password).not.toBe("Password123");
    expect(await savedUser.comparePassword("Password123")).toBe(true);
  });

  it("rejects missing or invalid registration fields", async () => {
    const cases = [
      {},
      { name: "", email: "test@example.com", password: "Password123" },
      { name: "Test", email: "", password: "Password123" },
      { name: "Test", email: "test@example.com", password: "short" },
      { name: 123, email: "test@example.com", password: "Password123" },
    ];

    for (const body of cases) {
      const response = await request(app)
        .post("/api/auth/register")
        .send(body);

      expect(response.status).toBe(400);
    }
  });

  it("rejects a duplicate email", async () => {
    await User.create({
      name: "Existing Citizen",
      email: "existing@example.com",
      password: "Password123",
    });

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Another Citizen",
        email: "EXISTING@example.com",
        password: "Password456",
      });

    expect(response.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await User.create({
      name: "Login Citizen",
      email: "login@example.com",
      password: "Password123",
    });
  });

  it("logs in with valid credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "LOGIN@example.com",
        password: "Password123",
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("success");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.user.email).toBe("login@example.com");
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "login@example.com",
        password: "WrongPassword",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("rejects an unknown email", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "unknown@example.com",
        password: "Password123",
      });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("rejects missing login fields", async () => {
    const cases = [
      {},
      { email: "", password: "Password123" },
      { email: "login@example.com", password: "" },
      { email: 123, password: "Password123" },
    ];

    for (const body of cases) {
      const response = await request(app)
        .post("/api/auth/login")
        .send(body);

      expect(response.status).toBe(400);
    }
  });
});
